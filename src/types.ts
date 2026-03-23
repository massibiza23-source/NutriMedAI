export type Language = 'en' | 'es' | 'it' | 'fr' | 'pt' | 'de';

export interface UserProfile {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  weight: number;
  height: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  healthGoals: string[];
  dietType: string;
  countries: string[];
  dietaryRestrictions: string[];
  allergies: string[];
  forbiddenIngredients: string;
  preferredIngredients: string;
  availableIngredients: string;
  lang?: Language;
}

export interface Meal {
  name: string;
  description: string;
  ingredients: string[];
  imageUrl?: string;
  prepTime: string;
  steps: string[];
  nutritionalInfo: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    saturatedFat: number;
  };
  recipe: string;
}

export interface DailyMealPlan {
  title: string;
  date: string;
  breakfast: Meal;
  lunch: Meal;
  snack: Meal;
  dinner: Meal;
  totalNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    saturatedFat: number;
    glycemicLoad: 'Low' | 'Medium' | 'High';
  };
  advice: string;
}

export interface WeeklyPlan {
  title: string;
  days: DailyMealPlan[];
  shoppingList: {
    category: string;
    items: string[];
  }[];
  weeklyAdvice: string;
}

export interface MonthlyPlan {
  title: string;
  weeks: WeeklyPlan[];
  monthlyAdvice: string;
}

export interface Translation {
  title: string;
  subtitle: string;
  profile: string;
  generate: string;
  history: string;
  age: string;
  weight: number;
  height: number;
  // ... more to be added in components
}
