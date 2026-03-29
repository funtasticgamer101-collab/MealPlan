import { useState, useEffect } from 'react';
import { generateWeeklyPlan, generateSingleRecipe, generateGroceryListFromDays, WeeklyPlan, DailyMenu, Recipe } from './services/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, ShoppingCart, Download, ChevronDown, ChevronUp, Loader2, CheckCircle2, Circle, UtensilsCrossed, RefreshCw, X, Settings, CalendarPlus } from 'lucide-react';

function getWeekIdentifier(offsetWeeks = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetWeeks * 7);
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime() + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60000;
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const week = Math.floor(diff / oneWeek);
  return `${now.getFullYear()}-W${week}`;
}

interface GroceryItem {
  name: string;
  checked: boolean;
}

import { safeStorage } from './lib/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState<'plan' | 'groceries' | 'nextWeek'>('plan');
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [nextPlan, setNextPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [regenerating, setRegenerating] = useState<{dayIdx: number, type: 'lunch'|'dinner', week: 'current'|'next'} | null>(null);

  const [cuisine, setCuisine] = useState(() => safeStorage.getItem('cuisine') || 'American Comfort Food');
  const [restrictions, setRestrictions] = useState<string[]>(() => {
    const saved = safeStorage.getItem('restrictions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved restrictions:", e);
        safeStorage.removeItem('restrictions');
      }
    }
    return ['Peanuts', 'Treenuts', 'Caesar Sauce', 'Shrimp', 'Shellfish'];
  });

  const CUISINES = [
    "American Comfort Food",
    "Italian",
    "Mexican",
    "Asian Fusion",
    "Mediterranean",
    "Healthy/Clean",
    "Quick & Easy",
    "Vegetarian",
    "Vegan"
  ];

  const COMMON_RESTRICTIONS = [
    "Peanuts", "Treenuts", "Shellfish", "Shrimp", "Dairy", "Gluten", "Caesar Sauce", "Pork", "Beef"
  ];

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  const loadPlan = async (forceRegenerate = false) => {
    try {
      setLoading(true);
      setError(null);
      const weekId = getWeekIdentifier();
      const cached = safeStorage.getItem(`plan-${weekId}`);
      
      if (cached && !forceRegenerate) {
        const parsedPlan = JSON.parse(cached);
        setPlan(parsedPlan);
        initializeGroceries(parsedPlan);
      } else {
        const newPlan = await generateWeeklyPlan(weekId, cuisine, restrictions);
        safeStorage.setItem(`plan-${weekId}`, JSON.stringify(newPlan));
        setPlan(newPlan);
        initializeGroceries(newPlan);
      }

      // Load next week if cached
      const nextWeekId = getWeekIdentifier(1);
      const cachedNext = safeStorage.getItem(`plan-${nextWeekId}`);
      if (cachedNext && !forceRegenerate) {
        setNextPlan(JSON.parse(cachedNext));
      } else if (forceRegenerate) {
        safeStorage.removeItem(`plan-${nextWeekId}`);
        setNextPlan(null);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load meal plan. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, []);

  const initializeGroceries = (loadedPlan: WeeklyPlan) => {
    let savedChecks = {};
    try {
      savedChecks = JSON.parse(safeStorage.getItem(`groceries-${loadedPlan.weekOf}`) || '{}');
    } catch (e) {
      console.error("Failed to parse saved groceries:", e);
      safeStorage.removeItem(`groceries-${loadedPlan.weekOf}`);
    }
    setGroceryItems(loadedPlan.groceryList.map(item => ({
      name: item,
      checked: !!savedChecks[item]
    })));
  };

  const toggleGrocery = (name: string) => {
    setGroceryItems(prev => {
      const next = prev.map(item => item.name === name ? { ...item, checked: !item.checked } : item);
      if (plan) {
        const checks = next.reduce((acc, item) => {
          if (item.checked) acc[item.name] = true;
          return acc;
        }, {} as Record<string, boolean>);
        safeStorage.setItem(`groceries-${plan.weekOf}`, JSON.stringify(checks));
      }
      return next;
    });
  };

  const handleGenerateNextWeek = async () => {
    try {
      setLoadingNext(true);
      const nextWeekId = getWeekIdentifier(1);
      const newPlan = await generateWeeklyPlan(nextWeekId, cuisine, restrictions);
      safeStorage.setItem(`plan-${nextWeekId}`, JSON.stringify(newPlan));
      setNextPlan(newPlan);
    } catch (err) {
      console.error(err);
      alert("Failed to generate next week's plan.");
    } finally {
      setLoadingNext(false);
    }
  };

  const handleRegenerateMeal = async (dayIdx: number, mealType: 'lunch' | 'dinner', week: 'current' | 'next' = 'current') => {
    setRegenerating({ dayIdx, type: mealType, week });
    try {
      const newRecipe = await generateSingleRecipe(mealType, cuisine, restrictions);
      
      let updatedDays: DailyMenu[] = [];
      const setTargetPlan = week === 'current' ? setPlan : setNextPlan;

      setTargetPlan(prev => {
        if (!prev) return prev;
        const newDays = [...prev.days];
        newDays[dayIdx] = {
          ...newDays[dayIdx],
          [mealType]: newRecipe
        };
        updatedDays = newDays;
        const newPlan = { ...prev, days: newDays };
        safeStorage.setItem(`plan-${prev.weekOf}`, JSON.stringify(newPlan));
        return newPlan;
      });

      // Background update grocery list
      generateGroceryListFromDays(updatedDays).then(newList => {
        setTargetPlan(prev => {
          if (!prev) return prev;
          const newPlan = { ...prev, groceryList: newList };
          safeStorage.setItem(`plan-${prev.weekOf}`, JSON.stringify(newPlan));
          return newPlan;
        });
        
        if (week === 'current') {
          setGroceryItems(prevItems => {
            const checkedMap = new Set(prevItems.filter(i => i.checked).map(i => i.name));
            return newList.map(name => ({
              name,
              checked: checkedMap.has(name)
            }));
          });
        }
      }).catch(console.error);

    } catch (err) {
      console.error(err);
      alert("Failed to regenerate meal.");
    } finally {
      setRegenerating(null);
    }
  };

  const handleSaveSettings = () => {
    safeStorage.setItem('cuisine', cuisine);
    safeStorage.setItem('restrictions', JSON.stringify(restrictions));
    setShowSettingsModal(false);
    loadPlan(true);
  };

  const toggleRestriction = (r: string) => {
    setRestrictions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-orange-100 sticky top-0 z-10 px-4 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 text-orange-600">
          <UtensilsCrossed className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight">Comfort Meals</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="p-2 text-orange-600 hover:bg-orange-50 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={handleInstall}
            className="flex items-center gap-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1.5 rounded-full text-sm font-medium transition-colors hidden sm:flex"
          >
            <Download className="w-4 h-4" />
            Install App
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-orange-500 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin" />
            <p className="font-medium animate-pulse">Crafting your comfort menu...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-center">
            <p>{error}</p>
            <button 
              onClick={() => {
                safeStorage.removeItem(`plan-${getWeekIdentifier()}`);
                window.location.reload();
              }} 
              className="mt-3 bg-red-100 hover:bg-red-200 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        ) : activeTab === 'plan' && plan ? (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">This Week's Menu</h2>
              <p className="text-gray-500 text-sm mt-1">A fresh batch of American comfort classics.</p>
            </div>
            {plan.days.map((day, idx) => (
              <DayCard 
                key={idx} 
                dayMenu={day} 
                dayIdx={idx}
                onRegenerate={(dIdx, type) => handleRegenerateMeal(dIdx, type, 'current')}
                regenerating={regenerating?.week === 'current' ? regenerating : null}
              />
            ))}
          </div>
        ) : activeTab === 'nextWeek' ? (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Next Week's Menu</h2>
              <p className="text-gray-500 text-sm mt-1">Plan ahead for the upcoming week.</p>
            </div>
            
            {!nextPlan && !loadingNext ? (
              <div className="bg-orange-50 rounded-2xl p-8 text-center border border-orange-100">
                <CalendarPlus className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Ready to plan ahead?</h3>
                <p className="text-gray-600 text-sm mb-6">Generate your menu for next week based on your current preferences.</p>
                <button 
                  onClick={handleGenerateNextWeek}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-sm"
                >
                  Generate Next Week's Plan
                </button>
              </div>
            ) : loadingNext ? (
              <div className="flex flex-col items-center justify-center h-64 text-orange-500 space-y-4">
                <Loader2 className="w-10 h-10 animate-spin" />
                <p className="font-medium animate-pulse">Crafting next week's menu...</p>
              </div>
            ) : nextPlan ? (
              <div className="space-y-4">
                {nextPlan.days.map((day, idx) => (
                  <DayCard 
                    key={idx} 
                    dayMenu={day} 
                    dayIdx={idx}
                    onRegenerate={(dIdx, type) => handleRegenerateMeal(dIdx, type, 'next')}
                    regenerating={regenerating?.week === 'next' ? regenerating : null}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : activeTab === 'groceries' && plan ? (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Grocery List</h2>
              <p className="text-gray-500 text-sm mt-1">Everything you need for the week.</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
              {groceryItems.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleGrocery(item.name)}
                  className={`w-full flex items-start gap-3 p-4 text-left transition-colors border-b border-orange-50 last:border-0 hover:bg-orange-50/50 ${
                    item.checked ? 'opacity-50' : ''
                  }`}
                >
                  <div className="mt-0.5 shrink-0 text-orange-500">
                    {item.checked ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </div>
                  <span className={`text-gray-800 ${item.checked ? 'line-through text-gray-500' : ''}`}>
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-orange-100 pb-safe z-20">
        <div className="flex max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('plan')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'plan' ? 'text-orange-600' : 'text-gray-400 hover:text-orange-400'
            }`}
          >
            <Calendar className="w-6 h-6" />
            <span className="text-xs font-medium">This Week</span>
          </button>
          <button
            onClick={() => setActiveTab('nextWeek')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'nextWeek' ? 'text-orange-600' : 'text-gray-400 hover:text-orange-400'
            }`}
          >
            <CalendarPlus className="w-6 h-6" />
            <span className="text-xs font-medium">Next Week</span>
          </button>
          <button
            onClick={() => setActiveTab('groceries')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'groceries' ? 'text-orange-600' : 'text-gray-400 hover:text-orange-400'
            }`}
          >
            <ShoppingCart className="w-6 h-6" />
            <span className="text-xs font-medium">Groceries</span>
          </button>
        </div>
      </nav>

      {/* Install Instructions Modal */}
      <AnimatePresence>
        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900">Install App</h3>
                <button 
                  onClick={() => setShowInstallModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4 text-gray-600 text-sm">
                <p>To install Comfort Meals on your device for the best experience:</p>
                
                <div className="space-y-3">
                  <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                    <h4 className="font-semibold text-orange-800 mb-1">iOS (Safari)</h4>
                    <p className="text-orange-700">Tap the <span className="font-bold">Share</span> button at the bottom, then select <span className="font-bold">Add to Home Screen</span>.</p>
                  </div>
                  
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <h4 className="font-semibold text-blue-800 mb-1">Android (Chrome)</h4>
                    <p className="text-blue-700">Tap the <span className="font-bold">Menu</span> (three dots) at the top right, then select <span className="font-bold">Add to Home screen</span> or <span className="font-bold">Install app</span>.</p>
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-800 mb-1">Desktop</h4>
                    <p className="text-gray-700">Click the install icon in the right side of your browser's address bar.</p>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <button 
                  onClick={() => setShowInstallModal(false)}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl transition-colors"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-lg text-gray-900">Preferences</h3>
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 overflow-y-auto space-y-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Cuisine Type</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {CUISINES.map(c => (
                      <button
                        key={c}
                        onClick={() => setCuisine(c)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border text-left ${
                          cuisine === c 
                            ? 'bg-orange-50 border-orange-500 text-orange-700' 
                            : 'bg-white border-gray-200 text-gray-600 hover:border-orange-200'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Dietary Restrictions</h4>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_RESTRICTIONS.map(r => (
                      <button
                        key={r}
                        onClick={() => toggleRestriction(r)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                          restrictions.includes(r)
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-red-100'
                        }`}
                      >
                        {restrictions.includes(r) ? 'â ' : '+ '} {r}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Selected restrictions will be strictly avoided in generated recipes.
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                <button 
                  onClick={handleSaveSettings}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Save & Regenerate Week
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DayCard({ 
  dayMenu, 
  dayIdx, 
  onRegenerate, 
  regenerating 
}: { 
  dayMenu: DailyMenu; 
  dayIdx: number;
  onRegenerate: (dayIdx: number, type: 'lunch' | 'dinner') => void;
  regenerating: {dayIdx: number, type: 'lunch'|'dinner', week?: string} | null;
  key?: string | number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-orange-50/50 transition-colors"
      >
        <h3 className="text-lg font-bold text-gray-900">{dayMenu.day}</h3>
        <div className="flex items-center gap-3">
          <div className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-1 rounded-md hidden sm:block">
            2 Meals
          </div>
          {isOpen ? <ChevronUp className="text-orange-400 w-5 h-5" /> : <ChevronDown className="text-orange-400 w-5 h-5" />}
        </div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 pt-2 space-y-6 border-t border-orange-50">
              <MealSection 
                title="Lunch" 
                recipe={dayMenu.lunch} 
                onRegenerate={() => onRegenerate(dayIdx, 'lunch')}
                isRegenerating={regenerating?.dayIdx === dayIdx && regenerating?.type === 'lunch'}
              />
              <div className="h-px bg-orange-100 w-full" />
              <MealSection 
                title="Dinner" 
                recipe={dayMenu.dinner} 
                onRegenerate={() => onRegenerate(dayIdx, 'dinner')}
                isRegenerating={regenerating?.dayIdx === dayIdx && regenerating?.type === 'dinner'}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MealSection({ 
  title, 
  recipe, 
  onRegenerate, 
  isRegenerating 
}: { 
  title: string; 
  recipe: Recipe;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{title}</span>
        </div>
        <button 
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="text-xs flex items-center gap-1 text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
          {isRegenerating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
      <h4 className="font-bold text-gray-900 text-lg leading-tight mb-1">{recipe.name}</h4>
      <p className="text-gray-500 text-sm mb-4 leading-relaxed">{recipe.description}</p>
      
      <div className="space-y-4 bg-orange-50/30 p-4 rounded-xl border border-orange-50">
        <div>
          <h5 className="font-semibold text-sm text-gray-900 mb-2 flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-orange-500" />
            Ingredients
          </h5>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5 marker:text-orange-300">
            {recipe.ingredients.map((ing, i) => <li key={i} className="pl-1">{ing}</li>)}
          </ul>
        </div>
        <div className="h-px bg-orange-100/50 w-full" />
        <div>
          <h5 className="font-semibold text-sm text-gray-900 mb-2 flex items-center gap-1.5">
            <UtensilsCrossed className="w-4 h-4 text-orange-500" />
            Instructions
          </h5>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2 marker:text-orange-400 marker:font-medium">
            {recipe.instructions.map((inst, i) => <li key={i} className="pl-1 leading-relaxed">{inst}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
