import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  User, 
  History, 
  ChefHat, 
  Activity, 
  Scale, 
  ArrowRight, 
  Globe,
  Utensils,
  Leaf,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Droplets,
  Zap,
  Clock
} from 'lucide-react';
import { UserProfile, DailyMealPlan, WeeklyPlan, MonthlyPlan, Language, Meal } from './types';
import { generateMealPlan, generateWeeklyPlan, generateMonthlyPlan, generateMealImage } from './services/gemini';
import { translations } from './translations';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Maximize2, Minimize2, Download, FileCode } from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<Language>('es');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<DailyMealPlan | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [monthlyPlan, setMonthlyPlan] = useState<MonthlyPlan | null>(null);
  const [history, setHistory] = useState<DailyMealPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'history'>('daily');
  const [error, setError] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(100);

  const apiKeyMissing = !process.env.GEMINI_API_KEY;

  const t = translations[lang];

  const adjustFontSize = (delta: number) => {
    setFontSize(prev => Math.min(Math.max(prev + delta, 80), 150));
  };

  const resetFontSize = () => setFontSize(100);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
  }, [fontSize]);

  useEffect(() => {
    const savedProfile = localStorage.getItem('nutrimed_profile');
    const savedHistory = localStorage.getItem('nutrimed_history');
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      // Ensure new fields exist for backward compatibility
      if (!parsed.dietaryRestrictions) parsed.dietaryRestrictions = [];
      if (!parsed.gender) parsed.gender = 'male';
      if (!parsed.dietType) parsed.dietType = 'mediterranean';
      if (!parsed.countries) parsed.countries = parsed.country ? [parsed.country] : ['spain'];
      if (!parsed.name) parsed.name = 'User';
      if (!parsed.allergies) parsed.allergies = [];
      setProfile(parsed);
      setIsEditingProfile(false);
    }
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const handleSaveProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newProfile: UserProfile = {
      name: formData.get('name') as string,
      age: Number(formData.get('age')),
      gender: formData.get('gender') as any,
      weight: Number(formData.get('weight')),
      height: Number(formData.get('height')),
      activityLevel: formData.get('activityLevel') as any,
      healthGoals: (formData.get('healthGoals') as string).split(',').map(s => s.trim()),
      dietType: formData.get('dietType') as string,
      countries: (formData.get('countries') as string).split(',').map(s => s.trim()),
      dietaryRestrictions: (formData.get('dietaryRestrictions') as string).split(',').map(s => s.trim()),
      allergies: (formData.get('allergies') as string).split(',').map(s => s.trim()),
      forbiddenIngredients: formData.get('forbiddenIngredients') as string,
      preferredIngredients: formData.get('preferredIngredients') as string,
      availableIngredients: formData.get('availableIngredients') as string,
    };
    setProfile(newProfile);
    localStorage.setItem('nutrimed_profile', JSON.stringify(newProfile));
    setIsEditingProfile(false);
  };

  const handleExcludeIngredient = async (ingredient: string) => {
    if (!profile) return;
    
    const newForbidden = profile.forbiddenIngredients 
      ? `${profile.forbiddenIngredients}, ${ingredient}`
      : ingredient;
      
    const newProfile = {
      ...profile,
      forbiddenIngredients: newForbidden
    };
    
    setProfile(newProfile);
    localStorage.setItem('nutrimed_profile', JSON.stringify(newProfile));
    
    // Regenerate current plan type
    if (viewMode === 'daily') await handleGenerateDaily();
    else if (viewMode === 'weekly') await handleGenerateWeekly();
    else if (viewMode === 'monthly') await handleGenerateMonthly();
  };

  const handleGenerateDaily = async () => {
    if (!profile) return;
    setIsLoading(true);
    setError(null);
    setViewMode('daily');
    try {
      const recentMealNames = history.slice(0, 5).flatMap(p => [p.breakfast.name, p.lunch.name, p.dinner.name]);
      const plan = await generateMealPlan(profile, recentMealNames, lang);
      
      setCurrentPlan(plan);
      setWeeklyPlan(null);
      const newHistory = [plan, ...history].slice(0, 10);
      setHistory(newHistory);
      localStorage.setItem('nutrimed_history', JSON.stringify(newHistory));
    } catch (err) {
      console.error(err);
      setError(lang === 'es' ? 'Error al generar el plan. Por favor, intenta de nuevo.' : 'Error generating plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateMeal = async (mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner', dayIndex?: number, weekIndex?: number) => {
    if (!profile) return;
    
    let targetPlan: DailyMealPlan | null = null;
    
    if (weekIndex !== undefined && monthlyPlan) {
      targetPlan = monthlyPlan.weeks[weekIndex].days[dayIndex!];
    } else if (dayIndex !== undefined && weeklyPlan) {
      targetPlan = weeklyPlan.days[dayIndex];
    } else if (currentPlan) {
      targetPlan = currentPlan;
    }

    if (!targetPlan) return;

    setIsLoading(true);
    setError(null);
    try {
      const { regenerateSingleMeal } = await import('./services/gemini');
      const newMeal = await regenerateSingleMeal(profile, targetPlan, mealType, lang);
      
      const updatedPlan = {
        ...targetPlan,
        [mealType]: newMeal
      };
      
      // Recalculate total nutrition
      const meals = [updatedPlan.breakfast, updatedPlan.lunch, updatedPlan.snack, updatedPlan.dinner];
      updatedPlan.totalNutrition = {
        calories: Math.round(meals.reduce((sum, m) => sum + m.nutritionalInfo.calories, 0)),
        protein: Math.round(meals.reduce((sum, m) => sum + m.nutritionalInfo.protein, 0)),
        carbs: Math.round(meals.reduce((sum, m) => sum + m.nutritionalInfo.carbs, 0)),
        fat: Math.round(meals.reduce((sum, m) => sum + m.nutritionalInfo.fat, 0)),
        fiber: Math.round(meals.reduce((sum, m) => sum + m.nutritionalInfo.fiber, 0)),
        saturatedFat: Math.round(meals.reduce((sum, m) => sum + m.nutritionalInfo.saturatedFat, 0) * 10) / 10,
        glycemicLoad: targetPlan.totalNutrition.glycemicLoad
      };

      if (weekIndex !== undefined && monthlyPlan) {
        const newMonthly = { ...monthlyPlan };
        newMonthly.weeks[weekIndex].days[dayIndex!] = updatedPlan;
        setMonthlyPlan(newMonthly);
      } else if (dayIndex !== undefined && weeklyPlan) {
        const newWeekly = { ...weeklyPlan };
        newWeekly.days[dayIndex] = updatedPlan;
        setWeeklyPlan(newWeekly);
      } else {
        setCurrentPlan(updatedPlan);
        // Update history
        const newHistory = history.map(p => p === currentPlan ? updatedPlan : p);
        setHistory(newHistory);
        localStorage.setItem('nutrimed_history', JSON.stringify(newHistory));
      }
    } catch (err) {
      setError(lang === 'es' ? 'Error al regenerar la receta.' : 'Error regenerating meal.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateWeekly = async () => {
    if (!profile) return;
    setIsLoading(true);
    setError(null);
    setViewMode('weekly');
    try {
      const recentMealNames = history.slice(0, 5).flatMap(p => [p.breakfast.name, p.lunch.name, p.dinner.name]);
      const plan = await generateWeeklyPlan(profile, recentMealNames, lang);
      setWeeklyPlan(plan);
      setCurrentPlan(null);
      setMonthlyPlan(null);
    } catch (err) {
      console.error(err);
      setError(lang === 'es' ? 'Error al generar el plan semanal. Por favor, intenta de nuevo.' : 'Error generating weekly plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateMonthly = async () => {
    if (!profile) return;
    setIsLoading(true);
    setError(null);
    setViewMode('monthly');
    try {
      const plan = await generateMonthlyPlan(profile, lang);
      setMonthlyPlan(plan);
      setWeeklyPlan(null);
      setCurrentPlan(null);
    } catch (err) {
      console.error(err);
      setError(lang === 'es' ? 'Error al generar el plan mensual. Por favor, intenta de nuevo.' : 'Error generating monthly plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAllImages = async () => {
    const plan = weeklyPlan || monthlyPlan || (currentPlan ? { days: [currentPlan] } : null);
    if (!plan) return;

    setIsLoading(true);
    try {
      const allDays = 'weeks' in plan ? (plan as any).weeks.flatMap((w: any) => w.days) : (plan as any).days;
      for (const day of allDays) {
        const meals = [day.breakfast, day.lunch, day.snack, day.dinner];
        await Promise.all(meals.map(async (meal) => {
          if (!meal.imageUrl) {
            try {
              meal.imageUrl = await generateMealImage(meal.name, meal.description);
            } catch (e) {
              console.error(`Failed to generate image for ${meal.name}`, e);
            }
          }
        }));
        // Force re-render by updating state
        if (weeklyPlan) setWeeklyPlan({ ...weeklyPlan });
        if (monthlyPlan) setMonthlyPlan({ ...monthlyPlan });
        if (currentPlan) setCurrentPlan({ ...currentPlan });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('print-area');
    if (!element) return;
    
    setIsLoading(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const dateStr = new Date().toISOString().split('T')[0];
      const planData = viewMode === 'monthly' ? monthlyPlan : (viewMode === 'weekly' ? weeklyPlan : currentPlan);
      const titleStr = planData && 'title' in planData ? (planData as any).title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'Plan';
      
      pdf.save(`${titleStr}.${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setError(lang === 'es' ? 'Error al generar el PDF.' : 'Error generating PDF.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!weeklyPlan) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Category,Item\n";
    
    weeklyPlan.shoppingList.forEach(cat => {
      cat.items.forEach(item => {
        csvContent += `"${cat.category}","${item}"\n`;
      });
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `NutriMed_ShoppingList_${weeklyPlan.days[0].date.split(',')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadHTML = () => {
    const planData = viewMode === 'monthly' ? monthlyPlan : (viewMode === 'weekly' ? weeklyPlan : currentPlan);

    const generateShoppingListHTML = (shoppingList: { category: string; items: string[] }[]) => `
      <div class="card-med p-8 bg-stone-50 border border-stone-200 my-8">
        <h3 class="text-2xl font-serif mb-6 flex items-center gap-2 text-med-olive">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          ${t.shoppingList}
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${shoppingList.map(cat => `
            <div>
              <h4 class="text-xs font-bold uppercase text-med-olive mb-2 tracking-widest">${cat.category}</h4>
              <ul class="text-sm space-y-1 text-stone-600">
                ${cat.items.map(item => `<li>• ${item}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const generateMealHTML = (meal: Meal, type: string) => `
      <div class="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-2">
        ${meal.imageUrl ? `<div class="aspect-video w-full overflow-hidden rounded-lg mb-2"><img src="${meal.imageUrl}" alt="${meal.name}" class="w-full h-full object-cover" referrerPolicy="no-referrer"></div>` : ''}
        <div class="flex justify-between items-start">
          <h4 class="font-bold text-med-olive uppercase text-xs tracking-wider">${type}</h4>
          ${meal.prepTime ? `<span class="text-[10px] font-bold text-med-olive bg-med-olive/5 px-2 py-0.5 rounded">${meal.prepTime}</span>` : ''}
        </div>
        <h3 class="font-serif text-lg">${meal.name}</h3>
        <p class="text-sm text-stone-600">${meal.description}</p>
        <details class="text-sm">
          <summary class="cursor-pointer text-med-olive font-medium hover:underline">Ver Receta e Ingredientes</summary>
          <div class="mt-2 p-3 bg-stone-50 rounded-lg space-y-4">
            <div>
              <h5 class="font-bold text-xs uppercase text-stone-400 mb-1">Ingredientes:</h5>
              <ul class="list-disc list-inside text-xs text-stone-600">
                ${meal.ingredients.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
            ${meal.steps && meal.steps.length > 0 ? `
              <div>
                <h5 class="font-bold text-xs uppercase text-stone-400 mb-1">Procedimiento:</h5>
                <ol class="list-decimal list-inside text-xs text-stone-600 space-y-1">
                  ${meal.steps.map(s => `<li>${s}</li>`).join('')}
                </ol>
              </div>
            ` : ''}
            <div>
              <h5 class="font-bold text-xs uppercase text-stone-400 mb-1">Instrucciones Adicionales:</h5>
              <p class="text-xs text-stone-600">${meal.recipe}</p>
            </div>
          </div>
        </details>
        <div class="flex gap-2 text-[10px] font-bold uppercase text-stone-400 pt-2 border-t border-stone-100">
          <span>${meal.nutritionalInfo.calories} kcal</span>
          <span>P: ${meal.nutritionalInfo.protein}g</span>
          <span>C: ${meal.nutritionalInfo.carbs}g</span>
          <span>G: ${meal.nutritionalInfo.fat}g</span>
        </div>
      </div>
    `;

    const generateDayHTML = (day: DailyMealPlan) => `
      <div class="space-y-4 p-6 bg-stone-50/50 rounded-2xl border border-stone-200">
        <h2 class="text-2xl font-serif text-stone-800 border-b border-stone-200 pb-2">${day.date}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${generateMealHTML(day.breakfast, t.meals.breakfast)}
          ${generateMealHTML(day.lunch, t.meals.lunch)}
          ${generateMealHTML(day.snack, t.meals.snack)}
          ${generateMealHTML(day.dinner, t.meals.dinner)}
        </div>
        <div class="p-4 bg-white rounded-xl border border-stone-200">
          <h4 class="text-xs font-bold uppercase text-stone-400 tracking-widest mb-2">Consejo del día</h4>
          <p class="text-sm italic text-stone-600">"${day.advice}"</p>
        </div>
      </div>
    `;

    let contentHTML = '';
    if (planData) {
      if (viewMode === 'monthly' && monthlyPlan) {
        contentHTML = monthlyPlan.weeks.map((week, wIdx) => `
          <div class="space-y-6 mb-12">
            <h1 class="text-3xl font-serif text-med-olive border-b-2 border-med-olive pb-2">Semana ${wIdx + 1}</h1>
            ${generateShoppingListHTML(week.shoppingList)}
            ${week.days.map(day => generateDayHTML(day)).join('')}
          </div>
        `).join('');
      } else if (viewMode === 'weekly' && weeklyPlan) {
        contentHTML = generateShoppingListHTML(weeklyPlan.shoppingList) + weeklyPlan.days.map(day => generateDayHTML(day)).join('');
      } else if (currentPlan) {
        contentHTML = generateDayHTML(currentPlan);
      }
    } else {
      contentHTML = `
        <div class="text-center space-y-8 py-12">
          <h2 class="text-4xl font-serif text-stone-800">¡Bienvenido a NutriMed AI!</h2>
          <p class="text-lg text-stone-600 max-w-2xl mx-auto">
            Esta es tu guía interactiva. Una vez que generes tu plan personalizado, podrás descargarlo aquí con todas tus recetas y consejos nutricionales.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
             <div class="p-8 bg-white rounded-3xl shadow-sm border border-stone-200">
                <div class="text-med-olive mb-4 flex justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14V8"/><path d="M12 18h.01"/></svg>
                </div>
                <h3 class="font-bold uppercase text-xs tracking-widest mb-2">Personalización</h3>
                <p class="text-sm text-stone-500">Planes adaptados a tu edad, peso y objetivos de salud.</p>
             </div>
             <div class="p-8 bg-white rounded-3xl shadow-sm border border-stone-200">
                <div class="text-emerald-600 mb-4 flex justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.47 10-10 10z"/><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/></svg>
                </div>
                <h3 class="font-bold uppercase text-xs tracking-widest mb-2">Dieta Mediterránea</h3>
                <p class="text-sm text-stone-500">Basado en evidencia clínica para el control de colesterol y glucosa.</p>
             </div>
             <div class="p-8 bg-white rounded-3xl shadow-sm border border-stone-200">
                <div class="text-med-olive mb-4 flex justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                </div>
                <h3 class="font-bold uppercase text-xs tracking-widest mb-2">Recetas IA</h3>
                <p class="text-sm text-stone-500">Instrucciones paso a paso generadas específicamente para ti.</p>
             </div>
          </div>
        </div>
      `;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NutriMed Plan - ${new Date().toLocaleDateString()}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #f8f7f5; color: #1c1917; }
        .font-serif { font-family: 'Playfair Display', serif; }
        .text-med-olive { color: #5A5A40; }
        .bg-med-olive { background-color: #5A5A40; }
        .border-med-olive { border-color: #5A5A40; }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-5xl mx-auto space-y-12">
        <header class="text-center space-y-4 pb-8 border-b border-stone-200">
            <div class="flex justify-center gap-4 mb-4">
                <div class="w-16 h-16 bg-med-olive rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                </div>
                <div class="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.47 10-10 10z"/><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/></svg>
                </div>
            </div>
            <h1 class="text-5xl font-serif text-stone-900">NutriMed AI</h1>
            ${planData && 'title' in planData ? `<h2 class="text-3xl font-serif text-med-olive mt-2">${(planData as any).title}</h2>` : ''}
            <p class="text-stone-500 uppercase tracking-[0.2em] text-xs font-bold">${t.subtitle}</p>
        </header>
        
        <main class="space-y-12">
            ${contentHTML}
        </main>

        <footer class="text-center pt-12 border-t border-stone-200 text-stone-400 text-xs">
            <p>&copy; ${new Date().getFullYear()} NutriMed AI - Tu Nutricionista Clínico Mediterráneo</p>
        </footer>
    </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const dateStr = new Date().toISOString().split('T')[0];
    const titleStr = planData && 'title' in planData ? (planData as any).title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'Plan';
    link.download = `${titleStr}.${dateStr}.html`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-med-olive rounded-xl flex items-center justify-center text-white shadow-lg shadow-med-olive/20">
              <Heart size={24} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900 leading-none">{t.title}</h1>
              <p className="text-xs text-stone-700 mt-1 uppercase tracking-widest font-bold">{t.subtitle}</p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <select 
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
              className="border border-stone-200 hover:bg-stone-50 text-stone-600 px-3 py-1 text-[10px] font-bold uppercase tracking-tighter appearance-none cursor-pointer rounded-lg bg-white"
            >
              <option value="en">EN - English</option>
              <option value="es">ES - Español</option>
              <option value="it">IT - Italiano</option>
              <option value="fr">FR - Français</option>
              <option value="pt">PT - Português</option>
              <option value="de">DE - Deutsch</option>
            </select>

            <div className="flex items-center gap-1 border border-stone-200 rounded-lg p-0.5 bg-stone-50/50 scale-90 origin-right">
              <button 
                onClick={() => adjustFontSize(-10)}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-stone-600 transition-all"
                title={t.decrease}
              >
                <span className="text-[10px] font-bold">A-</span>
              </button>
              <button 
                onClick={resetFontSize}
                className="px-1.5 h-6 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-stone-600 transition-all"
                title={t.reset}
              >
                <span className="text-[9px] font-bold uppercase tracking-tighter">{fontSize}%</span>
              </button>
              <button 
                onClick={() => adjustFontSize(10)}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-stone-600 transition-all"
                title={t.increase}
              >
                <span className="text-xs font-bold">A+</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {apiKeyMissing && (
        <div className="max-w-5xl mx-auto px-6 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">
              {lang === 'es' 
                ? 'Falta la clave API de Gemini. Por favor, configúrala en el panel de Secretos.' 
                : 'Gemini API Key is missing. Please configure it in the Secrets panel.'}
            </p>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 mt-12 space-y-12">
        {/* Profile Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-serif flex items-center gap-3">
              <User className="text-med-olive" />
              {t.profile}
            </h2>
            {!isEditingProfile && (
              <button 
                onClick={() => setIsEditingProfile(true)}
                className="text-med-olive hover:underline text-sm font-medium"
              >
                {t.editProfile}
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {isEditingProfile ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="card-med p-8"
              >
                <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.name}</label>
                    <input name="name" type="text" defaultValue={profile?.name || ''} required className="input-med" placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.age}</label>
                    <input name="age" type="number" defaultValue={profile?.age || 35} required className="input-med" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.gender}</label>
                    <select name="gender" defaultValue={profile?.gender || 'male'} className="input-med">
                      {Object.entries(t.genders).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.weight}</label>
                    <input name="weight" type="number" defaultValue={profile?.weight || 75} required className="input-med" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.height}</label>
                    <input name="height" type="number" defaultValue={profile?.height || 175} required className="input-med" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.activity}</label>
                    <select name="activityLevel" defaultValue={profile?.activityLevel || 'moderate'} className="input-med">
                      {Object.entries(t.activityLevels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.dietType}</label>
                    <select name="dietType" defaultValue={profile?.dietType || 'mediterranean'} className="input-med">
                      {Object.entries(t.dietTypes).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.countriesLabel} (e.g., Spain, Italy)</label>
                    <input name="countries" defaultValue={profile?.countries.join(', ') || 'Spain'} className="input-med" placeholder="Spain, Italy, etc." />
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.goals} (e.g., Lose weight, Gain muscle)</label>
                    <input name="healthGoals" defaultValue={profile?.healthGoals.join(', ') || 'Reduce cholesterol, Control glucose'} className="input-med" />
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.restrictions} (e.g., Diabetic, Celiac)</label>
                    <input name="dietaryRestrictions" defaultValue={profile?.dietaryRestrictions.join(', ') || ''} className="input-med" placeholder="Diabetic, Celiac, etc." />
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider">{t.allergies} (e.g., Peanuts, Shellfish)</label>
                    <input name="allergies" defaultValue={profile?.allergies.join(', ') || ''} className="input-med" placeholder="Peanuts, Shellfish, etc." />
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider flex items-center gap-2">
                      <AlertCircle size={14} className="text-red-500" />
                      {t.forbidden}
                    </label>
                    <textarea name="forbiddenIngredients" defaultValue={profile?.forbiddenIngredients || t.defaults.forbidden} className="input-med h-20" />
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-med-olive" />
                      {t.preferred}
                    </label>
                    <textarea name="preferredIngredients" defaultValue={profile?.preferredIngredients || t.defaults.preferred} className="input-med h-20" />
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700 tracking-wider flex items-center gap-2">
                      <Utensils size={14} className="text-med-ocean" />
                      {t.available}
                    </label>
                    <textarea name="availableIngredients" defaultValue={profile?.availableIngredients || t.defaults.available} className="input-med h-20" />
                  </div>
                  <div className="md:col-span-4 pt-4">
                    <button type="submit" className="btn-med btn-med-primary w-full">
                      {t.saveProfile}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="grid grid-cols-2 md:grid-cols-7 gap-4"
              >
                <div className="card-med p-6 flex flex-col items-center text-center gap-2">
                  <User className="text-med-olive" size={24} />
                  <span className="text-xs font-bold uppercase text-stone-600 tracking-widest">{t.name}</span>
                  <span className="text-lg font-serif truncate w-full">{profile?.name}</span>
                </div>
                <div className="card-med p-6 flex flex-col items-center text-center gap-2">
                  <Activity className="text-med-olive" size={24} />
                  <span className="text-xs font-bold uppercase text-stone-600 tracking-widest">{t.age}</span>
                  <span className="text-2xl font-serif">{profile?.age}</span>
                </div>
                <div className="card-med p-6 flex flex-col items-center text-center gap-2">
                  <User className="text-med-olive" size={24} />
                  <span className="text-xs font-bold uppercase text-stone-600 tracking-widest">{t.gender}</span>
                  <span className="text-lg font-serif">{t.genders[profile?.gender || 'male']}</span>
                </div>
                <div className="card-med p-6 flex flex-col items-center text-center gap-2">
                  <Scale className="text-med-olive" size={24} />
                  <span className="text-xs font-bold uppercase text-stone-600 tracking-widest">{t.weight}</span>
                  <span className="text-2xl font-serif">{profile?.weight}kg</span>
                </div>
                <div className="card-med p-6 flex flex-col items-center text-center gap-2">
                  <ArrowRight className="text-med-olive rotate-[-90deg]" size={24} />
                  <span className="text-xs font-bold uppercase text-stone-600 tracking-widest">{t.height}</span>
                  <span className="text-2xl font-serif">{profile?.height}cm</span>
                </div>
                <div className="card-med p-6 flex flex-col items-center text-center gap-2">
                  <Activity className="text-med-olive" size={24} />
                  <span className="text-xs font-bold uppercase text-stone-600 tracking-widest">{t.activity}</span>
                  <span className="text-lg font-serif">{t.activityLevels[profile?.activityLevel || 'moderate']}</span>
                </div>
                <div className="card-med p-6 flex flex-col items-center text-center gap-2">
                  <Globe className="text-med-olive" size={24} />
                  <span className="text-xs font-bold uppercase text-stone-600 tracking-widest">{t.countriesLabel}</span>
                  <span className="text-sm font-serif truncate w-full">{profile?.countries.join(', ')}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Action Section */}
        {!isEditingProfile && (
          <section className="flex flex-col items-center gap-6">
            <div className="flex flex-wrap justify-center gap-3 md:gap-4">
              <button 
                onClick={handleGenerateDaily}
                disabled={isLoading}
                className={`btn-med btn-med-primary text-sm md:text-lg px-4 md:px-8 py-2 md:py-4 shadow-xl shadow-med-olive/20 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading && viewMode === 'daily' ? (
                  <>
                    <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.generating}
                  </>
                ) : (
                  <>
                    <ChefHat size={18} className="md:w-5 md:h-5" />
                    {t.generate}
                  </>
                )}
              </button>
              <button 
                onClick={handleGenerateWeekly}
                disabled={isLoading}
                className={`btn-med btn-med-secondary text-sm md:text-lg px-4 md:px-8 py-2 md:py-4 shadow-xl shadow-med-olive/10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading && viewMode === 'weekly' ? (
                  <>
                    <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-med-olive/30 border-t-med-olive rounded-full animate-spin" />
                    {t.generating}
                  </>
                ) : (
                  <>
                    <History size={18} className="md:w-5 md:h-5" />
                    {t.generateWeekly}
                  </>
                )}
              </button>
              <button 
                onClick={handleGenerateMonthly}
                disabled={isLoading}
                className={`btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 text-sm md:text-lg px-4 md:px-8 py-2 md:py-4 shadow-xl shadow-stone-200/10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading && viewMode === 'monthly' ? (
                  <>
                    <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
                    {t.generating}
                  </>
                ) : (
                  <>
                    <Zap size={18} className="md:w-5 md:h-5" />
                    {t.generateMonthly}
                  </>
                )}
              </button>
              <button 
                onClick={() => setViewMode('history')}
                className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 text-sm md:text-lg px-4 md:px-8 py-2 md:py-4 shadow-xl shadow-stone-200/10"
              >
                <History size={18} className="md:w-5 md:h-5" />
                {t.viewAllHistory}
              </button>
              <button 
                onClick={handleDownloadHTML}
                className="btn-med bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 text-sm md:text-lg px-4 md:px-8 py-2 md:py-4 shadow-xl shadow-stone-200/10"
              >
                <Download size={18} className="md:w-5 md:h-5" />
                {t.downloadHTML}
              </button>
            </div>
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          </section>
        )}

        {/* Current Plan Section */}
        <AnimatePresence mode="wait">
          {viewMode === 'history' && (
            <motion.section
              key="history-page"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between border-b border-stone-200 pb-4">
                <h2 className="text-4xl font-serif flex items-center gap-3">
                  <History className="text-med-olive" size={32} />
                  {t.historyTitle}
                </h2>
                <button 
                  onClick={() => setViewMode('daily')}
                  className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-4 py-2"
                >
                  {t.backToMain}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {history.length > 0 ? history.map((plan, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="card-med p-6 space-y-4 hover:border-med-olive transition-all group cursor-pointer"
                    onClick={() => {
                      setCurrentPlan(plan);
                      setViewMode('daily');
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 rounded-full bg-med-cream flex items-center justify-center text-med-olive font-bold">
                        {idx + 1}
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-serif text-med-olive">{plan.totalNutrition.calories}</span>
                        <p className="text-[10px] uppercase font-bold text-stone-400 tracking-widest">{t.nutrients.calories}</p>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-serif group-hover:text-med-olive transition-colors line-clamp-1">{plan.title || plan.date}</h3>
                      {plan.title && <p className="text-xs text-stone-500 font-medium">{plan.date}</p>}
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-stone-600">
                          <Utensils size={14} className="text-med-olive" />
                          <span className="font-bold">{t.meals.breakfast}:</span> {plan.breakfast.name}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-stone-600">
                          <Utensils size={14} className="text-med-olive" />
                          <span className="font-bold">{t.meals.lunch}:</span> {plan.lunch.name}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-stone-600">
                          <Utensils size={14} className="text-med-olive" />
                          <span className="font-bold">{t.meals.dinner}:</span> {plan.dinner.name}
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-stone-100 flex justify-end">
                      <ArrowRight className="text-stone-300 group-hover:text-med-olive transition-colors" />
                    </div>
                  </motion.div>
                )) : (
                  <div className="col-span-full py-20 text-center space-y-4">
                    <History size={48} className="mx-auto text-stone-200" />
                    <p className="text-stone-500 italic">{t.noHistory}</p>
                  </div>
                )}
              </div>
            </motion.section>
          )}

          {history.length > 0 && !currentPlan && !weeklyPlan && !monthlyPlan && viewMode !== 'history' && (
            <motion.section
              key="history-preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-serif flex items-center gap-3">
                  <History className="text-med-olive" />
                  {t.history}
                </h2>
                <button 
                  onClick={() => setViewMode('history')}
                  className="text-med-olive hover:underline text-sm font-bold uppercase tracking-widest"
                >
                  {t.viewAllHistory} →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {history.slice(0, 4).map((plan, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentPlan(plan);
                      setViewMode('daily');
                    }}
                    className="card-med p-6 text-left hover:border-med-olive transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-serif text-xl">{plan.date}</h3>
                        <p className="text-sm text-stone-700 line-clamp-1">{plan.breakfast.name}, {plan.lunch.name}...</p>
                      </div>
                      <ArrowRight className="text-stone-300 group-hover:text-med-olive transition-colors" size={20} />
                    </div>
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {currentPlan && viewMode !== 'history' && (
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-wrap items-center justify-between border-b border-stone-200 pb-4 gap-4">
                <div className="flex items-center gap-4">
                  <Leaf className="text-med-olive" size={32} />
                  <div>
                    <h2 className="text-4xl font-serif">{currentPlan.title || currentPlan.date}</h2>
                    <p className="text-med-olive font-medium">{currentPlan.title ? currentPlan.date : t.advice}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={handleGenerateAllImages}
                    disabled={isLoading}
                    className="btn-med border border-med-olive/30 text-med-olive hover:bg-med-olive/5 px-4 py-2"
                  >
                    <ChefHat size={18} />
                    <span className="uppercase text-xs font-bold tracking-tighter">{t.generateAllImages}</span>
                  </button>
                  <button 
                    onClick={handleDownloadHTML}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-4 py-2"
                  >
                    <FileCode size={18} />
                    <span className="uppercase text-xs font-bold tracking-tighter">{t.downloadHTML}</span>
                  </button>
                  <button 
                    onClick={async () => {
                      // For daily plan, we need to wrap it in a hidden print area or similar
                      // Or just use the print preview logic
                      setCurrentPlan(currentPlan);
                      setShowPrintPreview(true);
                    }}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-4 py-2"
                  >
                    <Download size={18} />
                    <span className="uppercase text-xs font-bold tracking-tighter">{t.downloadPDF}</span>
                  </button>
                  <button 
                    onClick={handleGenerateDaily}
                    disabled={isLoading}
                    className="btn-med btn-med-primary px-4 py-2"
                  >
                    <Zap size={18} />
                    <span className="uppercase text-xs font-bold tracking-tighter">{t.regenerate}</span>
                  </button>
                </div>
              </div>

              {/* Nutritional Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <NutrientStat label={t.nutrients.calories} value={currentPlan.totalNutrition.calories} unit="kcal" icon={<Flame size={14} />} />
                <NutrientStat label={t.nutrients.protein} value={currentPlan.totalNutrition.protein} unit="g" icon={<Zap size={14} />} />
                <NutrientStat label={t.nutrients.carbs} value={currentPlan.totalNutrition.carbs} unit="g" icon={<Droplets size={14} />} />
                <NutrientStat label={t.nutrients.fat} value={currentPlan.totalNutrition.fat} unit="g" />
                <NutrientStat label={t.nutrients.fiber} value={currentPlan.totalNutrition.fiber} unit="g" />
                <NutrientStat label={t.nutrients.satFat} value={currentPlan.totalNutrition.saturatedFat} unit="g" color="text-red-500" />
                <div className="card-med p-4 flex flex-col items-center justify-center text-center bg-med-olive/5">
                  <span className="text-[10px] font-bold uppercase text-stone-400 tracking-widest mb-1">{t.nutrients.glycemic}</span>
                  <span className={`text-sm font-bold ${currentPlan.totalNutrition.glycemicLoad === 'Low' ? 'text-green-600' : 'text-orange-600'}`}>
                    {currentPlan.totalNutrition.glycemicLoad}
                  </span>
                </div>
              </div>

              {/* Meals Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <MealCard type={t.meals.breakfast} meal={currentPlan.breakfast} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('breakfast')} isLoading={isLoading} />
                <MealCard type={t.meals.lunch} meal={currentPlan.lunch} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('lunch')} isLoading={isLoading} />
                <MealCard type={t.meals.snack} meal={currentPlan.snack} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('snack')} isLoading={isLoading} />
                <MealCard type={t.meals.dinner} meal={currentPlan.dinner} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('dinner')} isLoading={isLoading} />
              </div>

              {/* General Advice */}
              <div className="card-med p-8 bg-med-olive text-white">
                <h3 className="text-2xl mb-4 italic">{t.advice}</h3>
                <div className="prose prose-invert max-w-none opacity-90">
                  <ReactMarkdown>{currentPlan.advice}</ReactMarkdown>
                </div>
              </div>
            </motion.section>
          )}

          {weeklyPlan && (
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              <div className="flex items-center justify-between border-b border-stone-200 pb-4">
                <div className="flex items-center gap-4">
                  <History className="text-med-olive" size={32} />
                  <div>
                    <h2 className="text-4xl font-serif">{weeklyPlan.title || t.weekly}</h2>
                    <p className="text-med-olive font-medium">{weeklyPlan.title ? t.weekly : t.advice}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={handleGenerateAllImages}
                    disabled={isLoading}
                    className="btn-med border border-med-olive/30 text-med-olive hover:bg-med-olive/5 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm"
                  >
                    <ChefHat size={16} />
                    <span className="uppercase font-bold tracking-tighter">{t.generateAllImages}</span>
                  </button>
                  <button 
                    onClick={handleDownloadHTML}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm"
                  >
                    <FileCode size={16} />
                    <span className="uppercase font-bold tracking-tighter">{t.downloadHTML}</span>
                  </button>
                  <button 
                    onClick={() => setShowPrintPreview(true)}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm"
                  >
                    <History size={16} />
                    <span className="uppercase font-bold tracking-tighter">{t.printPlan}</span>
                  </button>
                </div>
              </div>

              {/* Shopping List Section */}
              <div className="card-med p-8 bg-med-cream border-2 border-med-olive/20">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-3xl font-serif flex items-center gap-3">
                    <Utensils className="text-med-olive" />
                    {t.shoppingList}
                  </h3>
                  <button 
                    onClick={handleDownloadCSV}
                    className="text-xs font-bold uppercase text-med-olive hover:underline flex items-center gap-2"
                  >
                    <ArrowRight size={14} />
                    {t.downloadCSV}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {weeklyPlan.shoppingList.map((cat, i) => (
                    <div key={i} className="space-y-3">
                      <h4 className="text-lg font-bold text-med-olive uppercase tracking-wider border-b border-med-olive/10 pb-1">{cat.category}</h4>
                      <ul className="space-y-2">
                        {cat.items.map((item, j) => (
                          <li key={j} className="flex items-center gap-2 text-stone-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-med-olive/40" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Days */}
              <div className="space-y-12">
                {weeklyPlan.days.map((day, i) => (
                  <div key={i} className="space-y-6">
                    <h3 className="text-3xl font-serif border-l-4 border-med-olive pl-4">{day.date}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <MealCard type={t.meals.breakfast} meal={day.breakfast} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('breakfast', i)} isLoading={isLoading} />
                      <MealCard type={t.meals.lunch} meal={day.lunch} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('lunch', i)} isLoading={isLoading} />
                      <MealCard type={t.meals.snack} meal={day.snack} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('snack', i)} isLoading={isLoading} />
                      <MealCard type={t.meals.dinner} meal={day.dinner} t={t} onExclude={handleExcludeIngredient} onRegenerate={() => handleRegenerateMeal('dinner', i)} isLoading={isLoading} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Weekly Advice */}
              <div className="card-med p-8 bg-med-olive text-white">
                <h3 className="text-2xl mb-4 italic">{t.advice}</h3>
                <div className="prose prose-invert max-w-none opacity-90">
                  <ReactMarkdown>{weeklyPlan.weeklyAdvice}</ReactMarkdown>
                </div>
              </div>
            </motion.section>
          )}

          {monthlyPlan && (
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              <div className="flex flex-wrap items-center justify-between border-b border-stone-200 pb-4 gap-4">
                <div className="flex items-center gap-4">
                  <Zap className="text-med-olive" size={32} />
                  <div>
                    <h2 className="text-4xl font-serif">{monthlyPlan.title || t.monthly}</h2>
                    <p className="text-med-olive font-medium">{monthlyPlan.title ? t.monthly : t.advice}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={handleGenerateAllImages}
                    disabled={isLoading}
                    className="btn-med border border-med-olive/30 text-med-olive hover:bg-med-olive/5 px-4 py-2"
                  >
                    <ChefHat size={18} />
                    <span className="uppercase text-xs font-bold tracking-tighter">{t.generateAllImages}</span>
                  </button>
                  <button 
                    onClick={handleDownloadHTML}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-4 py-2"
                  >
                    <FileCode size={18} />
                    <span className="uppercase text-xs font-bold tracking-tighter">{t.downloadHTML}</span>
                  </button>
                  <button 
                    onClick={() => setShowPrintPreview(true)}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-4 py-2"
                  >
                    <Maximize2 size={18} />
                    <span className="uppercase text-xs font-bold tracking-tighter">{t.printPlan}</span>
                  </button>
                </div>
              </div>

              {monthlyPlan.weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="space-y-8">
                  <h3 className="text-3xl font-serif bg-med-olive text-white px-6 py-2 rounded-lg inline-block">
                    {t.week} {weekIdx + 1}
                  </h3>
                  
                  {/* Shopping List for the week */}
                  <div className="card-med p-8 bg-stone-50 border border-stone-200">
                    <h4 className="text-xl font-serif mb-4 flex items-center gap-2">
                      <Utensils size={20} />
                      {t.shoppingList} - {t.week} {weekIdx + 1}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {week.shoppingList.map((cat, i) => (
                        <div key={i}>
                          <h5 className="text-sm font-bold uppercase text-med-olive mb-2">{cat.category}</h5>
                          <ul className="text-sm space-y-1">
                            {cat.items.map((item, j) => (
                              <li key={j} className="text-stone-600">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Weekly Days */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {week.days.map((day, i) => (
                      <div key={i} className="card-med p-4 hover:shadow-md transition-shadow">
                        <h5 className="font-bold text-med-olive border-b border-stone-100 pb-2 mb-3">{day.date.split(',')[0]}</h5>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center group">
                            <p className="flex-1"><strong>{t.meals.breakfast}:</strong> {day.breakfast.name}</p>
                            <button 
                              onClick={() => handleRegenerateMeal('breakfast', i, weekIdx)} 
                              disabled={isLoading}
                              className="opacity-0 group-hover:opacity-100 text-med-olive hover:scale-110 transition-all disabled:opacity-30"
                              title={t.regenerateMeal}
                            >
                              <Zap size={12} />
                            </button>
                          </div>
                          <div className="flex justify-between items-center group">
                            <p className="flex-1"><strong>{t.meals.lunch}:</strong> {day.lunch.name}</p>
                            <button 
                              onClick={() => handleRegenerateMeal('lunch', i, weekIdx)} 
                              disabled={isLoading}
                              className="opacity-0 group-hover:opacity-100 text-med-olive hover:scale-110 transition-all disabled:opacity-30"
                              title={t.regenerateMeal}
                            >
                              <Zap size={12} />
                            </button>
                          </div>
                          <div className="flex justify-between items-center group">
                            <p className="flex-1"><strong>{t.meals.dinner}:</strong> {day.dinner.name}</p>
                            <button 
                              onClick={() => handleRegenerateMeal('dinner', i, weekIdx)} 
                              disabled={isLoading}
                              className="opacity-0 group-hover:opacity-100 text-med-olive hover:scale-110 transition-all disabled:opacity-30"
                              title={t.regenerateMeal}
                            >
                              <Zap size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Monthly Advice */}
              <div className="card-med p-8 bg-med-olive text-white">
                <h3 className="text-2xl mb-4 italic">{t.advice}</h3>
                <div className="prose prose-invert max-w-none opacity-90">
                  <ReactMarkdown>{monthlyPlan.monthlyAdvice}</ReactMarkdown>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-20 py-12 border-t border-stone-200 text-center">
        <p className="text-stone-600 text-sm font-serif italic">
          NutriMed AI — Evidence-based Mediterranean clinical nutrition.
        </p>
      </footer>

      {/* Print Preview Modal */}
      <AnimatePresence>
        {showPrintPreview && (weeklyPlan || monthlyPlan) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-stone-900/90 backdrop-blur-sm flex items-center justify-center p-0 md:p-8"
          >
            <div className={`bg-white w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${isFullscreen ? 'h-full max-w-none rounded-0' : 'max-w-[1200px] h-full max-h-[90vh] rounded-2xl'}`}>
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-white sticky top-0">
                <h3 className="text-xl font-serif">{t.previewTitle}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-3 py-1.5 md:px-4 md:py-2"
                    title={isFullscreen ? "Minimize" : "Fullscreen"}
                  >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                  <button 
                    onClick={handleDownloadPDF}
                    disabled={isLoading}
                    className="btn-med btn-med-primary px-3 py-1.5 md:px-6 md:py-2 text-xs md:text-sm"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Zap size={16} />
                    )}
                    {t.downloadPDF}
                  </button>
                  <button 
                    onClick={handlePrint}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm"
                  >
                    <History size={16} />
                    {t.printPlan}
                  </button>
                  <button 
                    onClick={() => {
                      setShowPrintPreview(false);
                      setIsFullscreen(false);
                    }}
                    className="btn-med border border-stone-200 hover:bg-stone-50 text-stone-600 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm"
                  >
                    {t.close}
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-4 md:p-12 bg-stone-100 flex justify-center">
                <div id="print-area" className={`bg-white shadow-lg p-10 print:shadow-none print:w-full print:p-0 ${monthlyPlan ? 'w-full max-w-[1400px]' : 'w-[1123px] min-h-[794px]'}`}>
                  {monthlyPlan ? (
                    <MonthlyTable plan={monthlyPlan} t={t} />
                  ) : (
                    weeklyPlan ? (
                      <WeeklyTable plan={weeklyPlan} t={t} />
                    ) : (
                      currentPlan && <DailyTable plan={currentPlan} t={t} />
                    )
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DailyTable({ plan, t }: { plan: DailyMealPlan, t: any }) {
  return (
    <div className="w-full h-full flex flex-col font-sans text-stone-900">
      <div className="flex items-center justify-between mb-8 border-b-2 border-med-olive pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-med-olive rounded-lg flex items-center justify-center text-white">
            <Heart size={24} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-none">{t.title}</h1>
            <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold mt-1">{t.subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-serif italic text-med-olive">{plan.title || plan.date}</h2>
          <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">NutriMed AI Clinical Nutrition</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="space-y-4">
          <h3 className="text-lg font-bold uppercase tracking-widest text-med-olive border-b border-med-olive/20 pb-2">{t.meals.breakfast}</h3>
          <p className="font-bold">{plan.breakfast.name}</p>
          <p className="text-xs text-stone-600">{plan.breakfast.description}</p>
          <ul className="text-[10px] list-disc list-inside text-stone-500">
            {plan.breakfast.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-bold uppercase tracking-widest text-med-olive border-b border-med-olive/20 pb-2">{t.meals.lunch}</h3>
          <p className="font-bold">{plan.lunch.name}</p>
          <p className="text-xs text-stone-600">{plan.lunch.description}</p>
          <ul className="text-[10px] list-disc list-inside text-stone-500">
            {plan.lunch.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-bold uppercase tracking-widest text-med-olive border-b border-med-olive/20 pb-2">{t.meals.snack}</h3>
          <p className="font-bold">{plan.snack.name}</p>
          <p className="text-xs text-stone-600">{plan.snack.description}</p>
          <ul className="text-[10px] list-disc list-inside text-stone-500">
            {plan.snack.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-bold uppercase tracking-widest text-med-olive border-b border-med-olive/20 pb-2">{t.meals.dinner}</h3>
          <p className="font-bold">{plan.dinner.name}</p>
          <p className="text-xs text-stone-600">{plan.dinner.description}</p>
          <ul className="text-[10px] list-disc list-inside text-stone-500">
            {plan.dinner.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-auto pt-8 border-t border-stone-200 grid grid-cols-2 gap-8 text-[10px] text-stone-500 italic">
        <p>• {t.advice}: {plan.advice.substring(0, 300)}...</p>
        <p className="text-right">NutriMed AI — Clinical Mediterranean Nutritionist</p>
      </div>
    </div>
  );
}

function MonthlyTable({ plan, t }: { plan: MonthlyPlan, t: any }) {
  return (
    <div className="w-full h-full flex flex-col font-sans text-stone-900">
      <div className="flex items-center justify-between mb-8 border-b-2 border-med-olive pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-med-olive rounded-lg flex items-center justify-center text-white">
            <Heart size={24} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-none">{t.title}</h1>
            <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold mt-1">{t.subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-serif italic text-med-olive">{plan.title || t.monthly}</h2>
          <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">NutriMed AI Clinical Nutrition</p>
        </div>
      </div>

      <div className="space-y-12">
        {plan.weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="space-y-4">
            <h3 className="text-lg font-bold uppercase tracking-widest text-med-olive border-b border-med-olive/20 pb-2">
              {t.week} {weekIdx + 1}
            </h3>
            <div className="overflow-hidden border border-stone-200 rounded-lg">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-stone-50">
                    <th className="border border-stone-200 p-2 w-20 bg-stone-100"></th>
                    {week.days.map((day, i) => (
                      <th key={i} className="border border-stone-200 p-2 text-center font-bold uppercase tracking-wider text-med-olive">
                        {day.date.split(',')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-stone-200 p-2 font-bold uppercase tracking-widest text-stone-400 bg-stone-50 text-[8px]">{t.meals.breakfast}</td>
                    {week.days.map((day, i) => (
                      <td key={i} className="border border-stone-200 p-2 align-top">
                        <div className="font-bold leading-tight">{day.breakfast.name}</div>
                        {day.breakfast.prepTime && <div className="text-[7px] text-stone-400 mt-0.5 italic">{day.breakfast.prepTime}</div>}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-stone-200 p-2 font-bold uppercase tracking-widest text-stone-400 bg-stone-50 text-[8px]">{t.meals.lunch}</td>
                    {week.days.map((day, i) => (
                      <td key={i} className="border border-stone-200 p-2 align-top bg-med-olive/5">
                        <div className="font-bold leading-tight">{day.lunch.name}</div>
                        {day.lunch.prepTime && <div className="text-[7px] text-stone-400 mt-0.5 italic">{day.lunch.prepTime}</div>}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-stone-200 p-2 font-bold uppercase tracking-widest text-stone-400 bg-stone-50 text-[8px]">{t.meals.dinner}</td>
                    {week.days.map((day, i) => (
                      <td key={i} className="border border-stone-200 p-2 align-top bg-med-olive/5">
                        <div className="font-bold leading-tight">{day.dinner.name}</div>
                        {day.dinner.prepTime && <div className="text-[7px] text-stone-400 mt-0.5 italic">{day.dinner.prepTime}</div>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Shopping List for the week in PDF/Print */}
            <div className="mt-4 p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <h4 className="text-xs font-bold uppercase text-med-olive mb-2 flex items-center gap-2">
                <Utensils size={12} />
                {t.shoppingList} - {t.week} {weekIdx + 1}
              </h4>
              <div className="grid grid-cols-4 gap-4">
                {week.shoppingList.map((cat, i) => (
                  <div key={i}>
                    <h5 className="text-[8px] font-bold uppercase text-stone-400 mb-1">{cat.category}</h5>
                    <ul className="text-[8px] space-y-0.5 text-stone-600">
                      {cat.items.map((item, j) => (
                        <li key={j}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-8 border-t border-stone-200 grid grid-cols-2 gap-8 text-[10px] text-stone-500 italic">
        <p>• {t.advice}: {plan.monthlyAdvice.substring(0, 300)}...</p>
        <p className="text-right">NutriMed AI — Clinical Mediterranean Nutritionist</p>
      </div>
    </div>
  );
}

function WeeklyTable({ plan, t }: { plan: WeeklyPlan, t: any }) {
  return (
    <div className="w-full h-full flex flex-col font-sans text-stone-900">
      <div className="flex items-center justify-between mb-8 border-b-2 border-med-olive pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-med-olive rounded-lg flex items-center justify-center text-white">
            <Heart size={24} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-none">{t.title}</h1>
            <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold mt-1">{t.subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-serif italic text-med-olive">{plan.title || t.weekly}</h2>
          <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">NutriMed AI Clinical Nutrition</p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border border-stone-200 rounded-lg">
        <table className="w-full h-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-stone-50">
              <th className="border border-stone-200 p-3 w-24 bg-stone-100"></th>
              {plan.days.map((day, i) => (
                <th key={i} className="border border-stone-200 p-3 text-center font-bold uppercase tracking-wider text-med-olive">
                  {day.date.split(',')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-stone-200 p-3 font-bold uppercase tracking-widest text-stone-400 bg-stone-50 text-[9px]">{t.meals.breakfast}</td>
              {plan.days.map((day, i) => (
                <td key={i} className="border border-stone-200 p-3 align-top">
                  <div className="font-bold mb-1 leading-tight">{day.breakfast.name}</div>
                  <div className="flex justify-between items-center text-[9px] text-stone-500">
                    <span>{day.breakfast.nutritionalInfo.calories} kcal</span>
                    {day.breakfast.prepTime && <span>{day.breakfast.prepTime}</span>}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-stone-200 p-3 font-bold uppercase tracking-widest text-stone-400 bg-stone-50 text-[9px]">{t.meals.lunch}</td>
              {plan.days.map((day, i) => (
                <td key={i} className="border border-stone-200 p-3 align-top bg-med-olive/5">
                  <div className="font-bold mb-1 leading-tight">{day.lunch.name}</div>
                  <div className="flex justify-between items-center text-[9px] text-stone-500">
                    <span>{day.lunch.nutritionalInfo.calories} kcal</span>
                    {day.lunch.prepTime && <span>{day.lunch.prepTime}</span>}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-stone-200 p-3 font-bold uppercase tracking-widest text-stone-400 bg-stone-50 text-[9px]">{t.meals.snack}</td>
              {plan.days.map((day, i) => (
                <td key={i} className="border border-stone-200 p-3 align-top">
                  <div className="font-bold mb-1 leading-tight">{day.snack.name}</div>
                  <div className="flex justify-between items-center text-[9px] text-stone-500">
                    <span>{day.snack.nutritionalInfo.calories} kcal</span>
                    {day.snack.prepTime && <span>{day.snack.prepTime}</span>}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-stone-200 p-3 font-bold uppercase tracking-widest text-stone-400 bg-stone-50 text-[9px]">{t.meals.dinner}</td>
              {plan.days.map((day, i) => (
                <td key={i} className="border border-stone-200 p-3 align-top bg-med-olive/5">
                  <div className="font-bold mb-1 leading-tight">{day.dinner.name}</div>
                  <div className="flex justify-between items-center text-[9px] text-stone-500">
                    <span>{day.dinner.nutritionalInfo.calories} kcal</span>
                    {day.dinner.prepTime && <span>{day.dinner.prepTime}</span>}
                  </div>
                </td>
              ))}
            </tr>
            <tr className="bg-stone-50 font-bold">
              <td className="border border-stone-200 p-3 uppercase tracking-widest text-stone-400 text-[9px]">TOTAL</td>
              {plan.days.map((day, i) => (
                <td key={i} className="border border-stone-200 p-3 text-center text-med-olive">
                  {day.totalNutrition.calories} kcal
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Shopping List for PDF/Print */}
      <div className="mt-6 p-4 bg-stone-50 border border-stone-200 rounded-lg">
        <h4 className="text-xs font-bold uppercase text-med-olive mb-3 flex items-center gap-2">
          <Utensils size={14} />
          {t.shoppingList}
        </h4>
        <div className="grid grid-cols-4 gap-6">
          {plan.shoppingList.map((cat, i) => (
            <div key={i}>
              <h5 className="text-[9px] font-bold uppercase text-stone-400 mb-1.5">{cat.category}</h5>
              <ul className="text-[9px] space-y-1 text-stone-600">
                {cat.items.map((item, j) => (
                  <li key={j}>• {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-8 text-[10px] text-stone-500 italic">
        <p>• {t.advice}: {plan.weeklyAdvice.substring(0, 200)}...</p>
        <p className="text-right">NutriMed AI — Clinical Mediterranean Nutritionist</p>
      </div>
    </div>
  );
}

function NutrientStat({ label, value, unit, icon, color = "text-stone-800" }: { label: string, value: number, unit: string, icon?: React.ReactNode, color?: string }) {
  return (
    <div className="card-med p-4 flex flex-col items-center justify-center text-center">
      <span className="text-[10px] font-bold uppercase text-stone-400 tracking-widest mb-1 flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className={`text-lg font-serif ${color}`}>{value}{unit}</span>
    </div>
  );
}

function MealCard({ type, meal, t, onExclude, onRegenerate, isLoading }: { type: string, meal: Meal, t: any, onExclude?: (ing: string) => void, onRegenerate?: () => void, isLoading?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(meal.imageUrl);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  useEffect(() => {
    setImageUrl(meal.imageUrl);
  }, [meal.imageUrl]);

  const handleGenerateImage = async () => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);
    try {
      const url = await generateMealImage(meal.name, meal.description);
      setImageUrl(url);
      meal.imageUrl = url; // Update the reference
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="card-med flex flex-col group/card relative">
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
          <div className="w-8 h-8 border-4 border-med-olive/30 border-t-med-olive rounded-full animate-spin" />
        </div>
      )}
      <div className="relative aspect-video w-full overflow-hidden bg-stone-100 border-b border-stone-100">
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={meal.name} 
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <Utensils className="text-stone-300" size={48} />
          </div>
        )}
        
        {/* Image Generation Overlay Button */}
        <div className={`absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity duration-300 ${imageUrl ? 'opacity-0 group-hover/card:opacity-100' : 'opacity-100'}`}>
          <button 
            onClick={handleGenerateImage}
            disabled={isGeneratingImage}
            className="btn-med bg-white/90 backdrop-blur-sm text-med-olive hover:bg-white shadow-lg px-4 py-2 text-xs font-bold uppercase flex items-center gap-2"
          >
            {isGeneratingImage ? (
              <>
                <div className="w-3 h-3 border-2 border-med-olive/30 border-t-med-olive rounded-full animate-spin" />
                {t.generatingPhoto}
              </>
            ) : (
              <>
                <ChefHat size={14} />
                {imageUrl ? t.regenerateImage || 'Regenerar Foto' : t.generateImage}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
        <span className="text-xs font-bold uppercase text-med-olive tracking-widest">{type}</span>
        <div className="flex items-center gap-3 text-[10px] font-bold text-stone-400">
          {meal.prepTime && (
            <div className="flex items-center gap-1 text-med-olive bg-med-olive/5 px-2 py-0.5 rounded">
              <Clock size={10} />
              <span>{meal.prepTime}</span>
            </div>
          )}
          <span>{meal.nutritionalInfo.calories} kcal</span>
          <span>P: {meal.nutritionalInfo.protein}g</span>
          <span>F: {meal.nutritionalInfo.fiber}g</span>
        </div>
      </div>
      <div className="p-6 flex-1">
        <h3 className="text-2xl mb-2">{meal.name}</h3>
        <p className="text-stone-600 text-sm mb-4 leading-relaxed">{meal.description}</p>
        
        <div className="flex flex-wrap gap-2 mb-6">
          {meal.ingredients.map((ing: string, i: number) => (
            <div key={i} className="flex items-center gap-1 px-2 py-1 bg-med-cream text-med-olive text-[10px] rounded-md font-medium group/ing">
              {ing}
              {onExclude && (
                <button 
                  onClick={() => onExclude(ing)}
                  className="opacity-0 group-hover/ing:opacity-100 hover:text-red-500 transition-opacity"
                  title="No me gusta este ingrediente"
                >
                  <AlertCircle size={10} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="flex-1 btn-med btn-med-secondary text-sm py-2"
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {t.recipe}
          </button>
          {onRegenerate && (
            <button 
              onClick={onRegenerate}
              disabled={isLoading}
              className="btn-med border border-med-olive/30 text-med-olive hover:bg-med-olive/5 px-3 py-2"
              title={t.regenerateMeal}
            >
              <Zap size={16} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-6 space-y-6">
                {meal.steps && meal.steps.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-med-olive tracking-widest mb-3 flex items-center gap-2">
                      <ChefHat size={14} />
                      {t.steps}
                    </h4>
                    <ol className="space-y-3">
                      {meal.steps.map((step, idx) => (
                        <li key={idx} className="text-sm text-stone-700 flex gap-3">
                          <span className="flex-shrink-0 w-5 h-5 bg-med-olive/10 text-med-olive rounded-full flex items-center justify-center text-[10px] font-bold">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                
                <div>
                  <h4 className="text-xs font-bold uppercase text-med-olive tracking-widest mb-3">
                    {t.recipe}
                  </h4>
                  <div className="text-sm text-stone-700 prose prose-stone max-w-none">
                    <ReactMarkdown>{meal.recipe}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
