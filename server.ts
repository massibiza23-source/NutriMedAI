import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

const MEAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
    prepTime: { type: Type.STRING, description: "Preparation time (e.g., '20 min', '1 hour')" },
    steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Step-by-step preparation procedures" },
    nutritionalInfo: {
      type: Type.OBJECT,
      properties: {
        calories: { type: Type.NUMBER },
        protein: { type: Type.NUMBER },
        carbs: { type: Type.NUMBER },
        fat: { type: Type.NUMBER },
        fiber: { type: Type.NUMBER },
        saturatedFat: { type: Type.NUMBER },
      },
      required: ["calories", "protein", "carbs", "fat", "fiber", "saturatedFat"],
    },
    recipe: { type: Type.STRING },
  },
  required: ["name", "description", "ingredients", "prepTime", "steps", "nutritionalInfo", "recipe"],
};

const DAILY_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    date: { type: Type.STRING },
    breakfast: MEAL_SCHEMA,
    lunch: MEAL_SCHEMA,
    snack: MEAL_SCHEMA,
    dinner: MEAL_SCHEMA,
    totalNutrition: {
      type: Type.OBJECT,
      properties: {
        calories: { type: Type.NUMBER },
        protein: { type: Type.NUMBER },
        carbs: { type: Type.NUMBER },
        fat: { type: Type.NUMBER },
        fiber: { type: Type.NUMBER },
        saturatedFat: { type: Type.NUMBER },
        glycemicLoad: { type: Type.STRING },
      },
      required: ["calories", "protein", "carbs", "fat", "fiber", "saturatedFat", "glycemicLoad"],
    },
    advice: { type: Type.STRING },
  },
  required: ["date", "breakfast", "lunch", "snack", "dinner", "totalNutrition", "advice"],
};

const WEEKLY_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    days: {
      type: Type.ARRAY,
      items: DAILY_PLAN_SCHEMA,
    },
    shoppingList: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          items: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["category", "items"],
      },
    },
    weeklyAdvice: { type: Type.STRING },
  },
  required: ["title", "days", "shoppingList", "weeklyAdvice"],
};

const MONTHLY_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    weeks: {
      type: Type.ARRAY,
      items: WEEKLY_PLAN_SCHEMA,
    },
    monthlyAdvice: { type: Type.STRING },
  },
  required: ["title", "weeks", "monthlyAdvice"],
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/generate-meal-plan", async (req, res) => {
    try {
      const { profile, recentMeals, lang } = req.body;
      const dietDesc = profile.dietType === 'none' ? 'general healthy' : profile.dietType;
      const systemInstruction = `You are an expert clinical nutrition AI specialized in ${dietDesc} diet, low cholesterol, glycemic control, and heart health.
Generate a nutritionally balanced daily meal plan in ${lang === 'es' ? 'Spanish' : 'English'} for a user named ${profile.name}.
${profile.countries.length > 0 ? `Adapt the recipes to the culinary culture and typical ingredients of these regions: ${profile.countries.join(", ")}.` : ''}
Strictly follow these rules:
1. Diet style: ${dietDesc}.
2. Low cholesterol and low saturated fat.
3. Dietary Restrictions: ${profile.dietaryRestrictions.join(", ")}.
4. ALLERGIES (CRITICAL): ${profile.allergies.join(", ")}. DO NOT include any ingredients the user is allergic to.
5. Avoid forbidden ingredients: ${profile.forbiddenIngredients}.
6. Prioritize: ${profile.preferredIngredients} and ${profile.availableIngredients}.
7. Recent meals to avoid: ${recentMeals.join(", ")}.
8. Nutritional targets: Adjust calories and macros based on goals: ${profile.healthGoals.join(", ")}.
9. Meals must be realistic for home cooking.
10. For each meal, provide a clear preparation time and detailed step-by-step procedures.
11. Generate a CATCHY and ATTRACTIVE TITLE for the plan that reflects the culinary influence (e.g., "Sinfonía Mediterránea", "Esencia de la Toscana", "Sabor de Andalucía").`;

      const prompt = `User Profile:
Name: ${profile.name}
Age: ${profile.age}
Gender: ${profile.gender}
Weight: ${profile.weight}kg
Height: ${profile.height}cm
Activity Level: ${profile.activityLevel}
Countries/Regions: ${profile.countries.join(", ") || 'International'}
Diet Type: ${profile.dietType}
Goals: ${profile.healthGoals.join(", ")}
Restrictions: ${profile.dietaryRestrictions.join(", ")}
Allergies: ${profile.allergies.join(", ")}

Generate a complete daily meal plan (Breakfast, Lunch, Snack, Dinner).`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: DAILY_PLAN_SCHEMA,
        },
      });

      if (!response.text) throw new Error("No response text from Gemini");
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-weekly-plan", async (req, res) => {
    try {
      const { profile, recentMeals, lang } = req.body;
      const dietDesc = profile.dietType === 'none' ? 'general healthy' : profile.dietType;
      const systemInstruction = `You are an expert clinical nutrition AI specialized in ${dietDesc} diet, low cholesterol, glycemic control, and heart health.
Generate a nutritionally balanced WEEKLY meal plan (7 days) in ${lang === 'es' ? 'Spanish' : 'English'} for a user named ${profile.name}.
${profile.countries.length > 0 ? `Adapt the recipes to the culinary culture and typical ingredients of these regions: ${profile.countries.join(", ")}.` : ''}
Strictly follow these rules:
1. Diet style: ${dietDesc}.
2. Low cholesterol and low saturated fat.
3. Dietary Restrictions: ${profile.dietaryRestrictions.join(", ")}.
4. ALLERGIES (CRITICAL): ${profile.allergies.join(", ")}. DO NOT include any ingredients the user is allergic to.
5. Avoid forbidden ingredients: ${profile.forbiddenIngredients}.
6. Prioritize: ${profile.preferredIngredients} and ${profile.availableIngredients}.
7. Recent meals to avoid: ${recentMeals.join(", ")}.
8. Nutritional targets per day: Adjust based on goals: ${profile.healthGoals.join(", ")}.
9. Meals must be realistic for home cooking.
10. For each meal, provide a clear preparation time and detailed step-by-step procedures.
11. Include a categorized shopping list for the entire week.
12. Generate a CATCHY and ATTRACTIVE TITLE for the weekly plan that reflects the culinary influence (e.g., "Ruta Gastronómica Mediterránea", "Semana de Bienestar Ibérico", "Gran Tour de Italia").`;

      const prompt = `User Profile:
Name: ${profile.name}
Age: ${profile.age}
Gender: ${profile.gender}
Weight: ${profile.weight}kg
Height: ${profile.height}cm
Activity Level: ${profile.activityLevel}
Countries/Regions: ${profile.countries.join(", ") || 'International'}
Diet Type: ${profile.dietType}
Goals: ${profile.healthGoals.join(", ")}
Restrictions: ${profile.dietaryRestrictions.join(", ")}
Allergies: ${profile.allergies.join(", ")}

Generate a complete 7-day weekly meal plan and shopping list.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: WEEKLY_PLAN_SCHEMA,
        },
      });

      if (!response.text) throw new Error("No response text from Gemini");
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-monthly-plan", async (req, res) => {
    try {
      const { profile, lang } = req.body;
      const dietDesc = profile.dietType === 'none' ? 'general healthy' : profile.dietType;
      const systemInstruction = `You are an expert clinical nutrition AI specialized in ${dietDesc} diet, low cholesterol, glycemic control, and heart health.
Generate a nutritionally balanced MONTHLY meal plan (4 weeks, 28 days) in ${lang === 'es' ? 'Spanish' : 'English'} for a user named ${profile.name}.
${profile.countries.length > 0 ? `Adapt the recipes to the culinary culture and typical ingredients of these regions: ${profile.countries.join(", ")}.` : ''}
Strictly follow these rules:
1. Diet style: ${dietDesc}. VARIETY IS KEY. DO NOT REPEAT MEALS.
2. Low cholesterol and low saturated fat.
3. Dietary Restrictions: ${profile.dietaryRestrictions.join(", ")}.
4. ALLERGIES (CRITICAL): ${profile.allergies.join(", ")}. DO NOT include any ingredients the user is allergic to.
5. Avoid forbidden ingredients: ${profile.forbiddenIngredients}.
6. Prioritize: ${profile.preferredIngredients} and ${profile.availableIngredients}.
7. Nutritional targets per day: Adjust based on goals: ${profile.healthGoals.join(", ")}.
8. For each meal, provide a clear preparation time and detailed step-by-step procedures.
9. Each week must have its own shopping list.
10. Provide a general monthly advice.
11. Generate a CATCHY and ATTRACTIVE TITLE for the monthly plan that reflects the culinary influence (e.g., "Odisea Mediterránea: Un Mes de Salud", "El Legado de la Dieta Mediterránea", "30 Días de Sol y Sabor").`;

      const prompt = `User Profile:
Name: ${profile.name}
Age: ${profile.age}
Gender: ${profile.gender}
Weight: ${profile.weight}kg
Height: ${profile.height}cm
Activity Level: ${profile.activityLevel}
Countries/Regions: ${profile.countries.join(", ") || 'International'}
Diet Type: ${profile.dietType}
Goals: ${profile.healthGoals.join(", ")}
Restrictions: ${profile.dietaryRestrictions.join(", ")}
Allergies: ${profile.allergies.join(", ")}

Generate a complete 28-day monthly meal plan (4 weeks) with shopping lists for each week. Ensure maximum variety and no repetition.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: MONTHLY_PLAN_SCHEMA,
        },
      });

      if (!response.text) throw new Error("No response text from Gemini");
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/regenerate-single-meal", async (req, res) => {
    try {
      const { profile, currentPlan, mealType, lang } = req.body;
      const dietDesc = profile.dietType === 'none' ? 'general healthy' : profile.dietType;
      const systemInstruction = `You are an expert clinical nutrition AI specialized in ${dietDesc} diet, low cholesterol, glycemic control, and heart health.
Generate a SINGLE nutritionally balanced meal (${mealType}) in ${lang === 'es' ? 'Spanish' : 'English'} for a user named ${profile.name}.
${profile.countries.length > 0 ? `Adapt the recipe to the culinary culture and typical ingredients of these regions: ${profile.countries.join(", ")}.` : ''}
Strictly follow these rules:
1. Diet style: ${dietDesc}.
2. Low cholesterol and low saturated fat.
3. Dietary Restrictions: ${profile.dietaryRestrictions.join(", ")}.
4. ALLERGIES (CRITICAL): ${profile.allergies.join(", ")}. DO NOT include any ingredients the user is allergic to.
5. Avoid forbidden ingredients: ${profile.forbiddenIngredients}.
6. Prioritize: ${profile.preferredIngredients} and ${profile.availableIngredients}.
7. AVOID REPEATING the current meal: ${currentPlan[mealType].name}.
8. Ensure it complements the other meals in the day:
   - Breakfast: ${currentPlan.breakfast.name}
   - Lunch: ${currentPlan.lunch.name}
   - Snack: ${currentPlan.snack.name}
   - Dinner: ${currentPlan.dinner.name}
9. Meals must be realistic for home cooking.
10. Provide a clear preparation time and detailed step-by-step procedures.`;

      const prompt = `User Profile:
Name: ${profile.name}
Age: ${profile.age}
Gender: ${profile.gender}
Weight: ${profile.weight}kg
Height: ${profile.height}cm
Activity Level: ${profile.activityLevel}
Countries/Regions: ${profile.countries.join(", ") || 'International'}
Diet Type: ${profile.dietType}
Goals: ${profile.healthGoals.join(", ")}
Restrictions: ${profile.dietaryRestrictions.join(", ")}
Allergies: ${profile.allergies.join(", ")}

Generate a new ${mealType} to replace the current one.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: MEAL_SCHEMA,
        },
      });

      if (!response.text) throw new Error("No response text from Gemini");
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-meal-image", async (req, res) => {
    try {
      const { mealName, description } = req.body;
      const prompt = `A high-quality, appetizing, professional food photography of a Mediterranean dish: ${mealName}. ${description}. The lighting should be warm and natural, on a clean wooden table or ceramic plate.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      });

      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return res.json({ imageUrl: `data:image/png;base64,${part.inlineData.data}` });
          }
        }
      }
      throw new Error("No image generated");
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
