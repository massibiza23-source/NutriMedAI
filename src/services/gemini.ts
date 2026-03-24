import { UserProfile, DailyMealPlan, Language, Meal } from "../types";

export async function regenerateSingleMeal(
  profile: UserProfile,
  currentPlan: DailyMealPlan,
  mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner',
  lang: Language
): Promise<Meal> {
  const response = await fetch("/api/regenerate-single-meal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, currentPlan, mealType, lang }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to regenerate meal");
  }

  return response.json();
}

export async function generateMealPlan(
  profile: UserProfile,
  recentMeals: string[],
  lang: Language
): Promise<DailyMealPlan> {
  const response = await fetch("/api/generate-meal-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, recentMeals, lang }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate meal plan");
  }

  return response.json();
}

export async function generateWeeklyPlan(
  profile: UserProfile,
  recentMeals: string[],
  lang: Language
): Promise<any> {
  const response = await fetch("/api/generate-weekly-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, recentMeals, lang }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate weekly plan");
  }

  return response.json();
}

export async function generateMonthlyPlan(
  profile: UserProfile,
  lang: Language
): Promise<any> {
  const response = await fetch("/api/generate-monthly-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, lang }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate monthly plan");
  }

  return response.json();
}

export async function generateMealImage(mealName: string, description: string): Promise<string> {
  const response = await fetch("/api/generate-meal-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mealName, description }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate meal image");
  }

  const data = await response.json();
  return data.imageUrl;
}
