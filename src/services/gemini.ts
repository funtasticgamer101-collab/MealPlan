import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface Recipe {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
}

export interface DailyMenu {
  day: string;
  lunch: Recipe;
  dinner: Recipe;
}

export interface WeeklyPlan {
  weekOf: string;
  days: DailyMenu[];
  groceryList: string[];
}

export async function generateWeeklyPlan(weekIdentifier: string, cuisine: string, restrictions: string[]): Promise<WeeklyPlan> {
  const restrictionsText = restrictions.length > 0 
    ? `STRICT DIETARY RESTRICTIONS: DO NOT include any ${restrictions.join(", ")}, or anything containing these.` 
    : "No specific dietary restrictions.";

  const prompt = `
Generate a 7-day meal plan (Monday to Sunday) for ${cuisine}.
Requirements:
- Include Lunch and Dinner for each day.
- ${restrictionsText}
- All recipes MUST be for exactly ONE portion / ONE serving. Adjust ingredient quantities accordingly.
- Make the recipes realistic and easy to follow.
- Provide a list of ingredients with quantities for each recipe.
- Provide step-by-step instructions.
- Provide a consolidated grocery list for the entire week, combining quantities where possible.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          days: {
            type: Type.ARRAY,
            description: "Array of 7 days from Monday to Sunday",
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING, description: "Name of the day, e.g., Monday" },
                lunch: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    ingredients: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    instructions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["name", "description", "ingredients", "instructions"]
                },
                dinner: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    ingredients: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    instructions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["name", "description", "ingredients", "instructions"]
                }
              },
              required: ["day", "lunch", "dinner"]
            }
          },
          groceryList: {
            type: Type.ARRAY,
            description: "Consolidated list of all ingredients needed for the entire week, combining quantities where possible.",
            items: { type: Type.STRING }
          }
        },
        required: ["days", "groceryList"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    weekOf: weekIdentifier,
    days: data.days || [],
    groceryList: data.groceryList || []
  };
}

export async function generateSingleRecipe(mealType: string, cuisine: string, restrictions: string[]): Promise<Recipe> {
  const restrictionsText = restrictions.length > 0 
    ? `STRICT DIETARY RESTRICTIONS: DO NOT include any ${restrictions.join(", ")}, or anything containing these.` 
    : "No specific dietary restrictions.";

  const prompt = `
Generate a single ${mealType} recipe for ${cuisine}.
Requirements:
- ${restrictionsText}
- All recipes MUST be for exactly ONE portion / ONE serving. Adjust ingredient quantities accordingly.
- Make the recipe realistic and easy to follow.
- Provide a list of ingredients with quantities.
- Provide step-by-step instructions.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          ingredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          instructions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["name", "description", "ingredients", "instructions"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function generateGroceryListFromDays(days: DailyMenu[]): Promise<string[]> {
  const prompt = `
Given the following 7-day meal plan, generate a consolidated grocery list.
Combine quantities for identical ingredients where possible.

Meal Plan:
${JSON.stringify(days, null, 2)}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "Consolidated list of all ingredients needed for the entire week, combining quantities where possible.",
        items: { type: Type.STRING }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}
