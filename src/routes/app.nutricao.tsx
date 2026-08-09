import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate, getLocalDateMinusDays } from "@/lib/utils";
import { MEAL_TYPES } from "@/lib/meal-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Sparkles,
  Trash2,
  Apple,
  Star,
  Copy,
  Pencil,
  ChefHat,
  BarChart3,
  Camera,
  Loader2,
  Heart,
  Barcode,
  Library,
  Mic,
  TrendingDown,
  TrendingUp,
  Minus,
  Zap,
} from "lucide-react";
import { lookupNutrition, analyzePhoto } from "@/server-fns/nutrition.functions";
import { calculateTdee } from "@/server-fns/corpo.functions";
import {
  DEFAULT_PROTEIN_FACTOR,
  matchesSuggestion,
  shouldAutoUpdateGoal,
  suggestGoals,
} from "@/lib/nutrition-goals";
import { parseFoodWeight, scaleMacros, rescaleMacros } from "@/lib/food-utils";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { FoodLibrary } from "@/components/FoodLibrary";
import { VoiceMealRecorder } from "@/components/voice-meal-recorder";
import { SuggestMealDialog } from "@/components/suggest-meal-dialog";
import { QuickAddMealDialog } from "@/components/quick-add-meal-dialog";

export const Route = createFileRoute("/app/nutricao")({
  component: NutricaoPage,
});

type Meal = { id: string; meal_type: string; meal_date: string };
type Item = {
  id: string;
  meal_id: string;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type FavoriteFood = {
  id: string;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type LibraryFood = {
  id: string;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function NutricaoPage() {
  const { user, session } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [open, setOpen] = useState(false);
  const [mealType, setMealType] = useState(MEAL_TYPES[0]);
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState<number | "">(100);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const [mCal, setMCal] = useState<number | "">("");
  const [mProt, setMProt] = useState<number | "">("");
  const [mCarb, setMCarb] = useState<number | "">("");
  const [mFat, setMFat] = useState<number | "">("");
  const [barcodePortionLabel, setBarcodePortionLabel] = useState("");
  const [barcodePortionSource, setBarcodePortionSource] = useState<"barcode" | "ai" | "manual" | "">(
    "",
  );

  // edit quantity
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editGrams, setEditGrams] = useState<number | "">(100);

  // photo analysis
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoMeal, setPhotoMeal] = useState(MEAL_TYPES[1]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoItems, setPhotoItems] = useState<
    Array<{
      name: string;
      grams: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      selected: boolean;
    }>
  >([]);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [userGoals, setUserGoals] = useState<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>({ calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 });

  // biblioteca (balcão único no diálogo do "+")
  const [library, setLibrary] = useState<LibraryFood[]>([]);
  const [libQuery, setLibQuery] = useState("");
  // porção de referência dos macros preenchidos; quando definida, mudar a porção
  // reescala os macros proporcionalmente (mesmo comportamento do FoodLibrary).
  const [refGrams, setRefGrams] = useState<number | null>(null);

  // Guarda síncrona anti double-tap: impede que um disparo duplo do botão
  // (toque rápido repetido antes do reload) insira refeição/itens em duplicidade.
  // useRef é síncrono — funciona mesmo antes de o estado `loading` re-renderizar.
  const writingRef = useRef(false);
  const guard = async (fn: () => Promise<unknown>): Promise<void> => {
    if (writingRef.current) return;
    writingRef.current = true;
    try {
      await fn();
    } finally {
      writingRef.current = false;
    }
  };

  const today = getLocalDate();

  const onBarcode = async (code: string) => {
    setScanOpen(false);
    setOpen(false);
    setScanLoading(true);
    setQuery("");
    setGrams(100);
    setManual(false);
    setMCal("");
    setMProt("");
    setMCarb("");
    setMFat("");
    setBarcodePortionLabel("");
    setBarcodePortionSource("");
    setRefGrams(null);
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
      );
      const j = await r.json();
      if (j.status === 1 && j.product) {
        const p = j.product;
        const n = p.nutriments ?? {};
        const name = p.product_name_pt || p.product_name || `EAN ${code}`;
        const servingGrams =
          parseFoodWeight(p.serving_size) ?? parseFoodWeight(p.quantity) ?? 100;
        setQuery(name);
        setGrams(servingGrams);
        setBarcodePortionLabel(
          p.serving_size
            ? `Porção detectada: ${p.serving_size}`
            : `Porção detectada: ${servingGrams}g`,
        );
        setBarcodePortionSource("barcode");
        setManual(true);
        const macros = scaleMacros(n, servingGrams);
        setMCal(macros.calories);
        setMProt(macros.protein_g);
        setMCarb(macros.carbs_g);
        setMFat(macros.fat_g);
        // macros correspondem à porção escaneada → mudar "Porção (g)" reescala proporcional
        setRefGrams(servingGrams);
        setOpen(true);
        toast.success(
          servingGrams === 100 ? `${name} encontrado` : `${name} encontrado (${servingGrams}g)`,
        );
        return;
      }

      const macros = await lookupNutrition({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: { query: code, grams: 100 },
      });
      setQuery(macros.name);
      setManual(true);
      setMCal(macros.calories);
      setMProt(macros.protein_g);
      setMCarb(macros.carbs_g);
      setMFat(macros.fat_g);
      // macros estimados para 100g → mudar "Porção (g)" reescala proporcional
      setRefGrams(100);
      setBarcodePortionLabel("Porção estimada pela IA");
      setBarcodePortionSource("ai");
      setOpen(true);
      toast.success(`${macros.name} (estimado por IA)`);
    } catch {
      setQuery(`Código ${code}`);
      setManual(true);
      setBarcodePortionLabel("");
      setBarcodePortionSource("manual");
      setOpen(true);
      toast("Preencha o nome e os macros manualmente");
    } finally {
      setScanLoading(false);
    }
  };

  const loadLibrary = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("food_library")
      .select("id,name,grams,calories,protein_g,carbs_g,fat_g")
      .eq("user_id", user.id)
      .order("name");
    setLibrary((data ?? []) as LibraryFood[]);
  };

  const load = async () => {
    if (!user) return;
    const { data: ms } = await supabase
      .from("meals")
      .select("id,meal_type,meal_date")
      .eq("user_id", user.id)
      .eq("meal_date", today)
      .order("created_at");
    setMeals(ms ?? []);
    const ids = (ms ?? []).map((m) => m.id);
    if (ids.length) {
      const { data: its } = await supabase
        .from("meal_items")
        .select("*")
        .in("meal_id", ids)
        .order("created_at");
      setItems((its ?? []) as Item[]);
    } else {
      setItems([]);
    }

    // load recent unique foods (last 30 days)
    const { data: recentRaw } = await supabase
      .from("meal_items")
      .select("id,meal_id,name,grams,calories,protein_g,carbs_g,fat_g,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);
    const seen = new Set<string>();
    const uniq: Item[] = [];
    for (const r of recentRaw ?? []) {
      const k = (r.name as string).toLowerCase().trim();
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(r as Item);
      if (uniq.length >= 8) break;
    }
    setRecent(uniq);

    const { data: favs } = await supabase
      .from("favorite_foods")
      .select("id,name,grams,calories,protein_g,carbs_g,fat_g")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setFavorites(
      (favs ?? []) as Array<{
        id: string;
        name: string;
        grams: number;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }>,
    );

    const [{ data: g }, tdeeRes] = await Promise.all([
      supabase
        .from("goals")
        .select("calories,protein_g,carbs_g,fat_g,goal_auto,protein_factor")
        .eq("user_id", user.id)
        .maybeSingle(),
      calculateTdee({
        headers: { Authorization: `Bearer ${session?.access_token}` },
      }).catch(() => null),
    ]);

    const defaults = { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 };
    let nextGoals = g
      ? {
          calories: Number(g.calories ?? 2000),
          protein_g: Number(g.protein_g ?? 140),
          carbs_g: Number(g.carbs_g ?? 220),
          fat_g: Number(g.fat_g ?? 65),
        }
      : defaults;

    if (tdeeRes && tdeeRes.tdee != null && tdeeRes.weight != null) {
      const proteinFactor = g?.protein_factor ?? DEFAULT_PROTEIN_FACTOR;
      const suggested = suggestGoals(tdeeRes.tdee, tdeeRes.weight, proteinFactor);
      const auto = shouldAutoUpdateGoal(g, g?.goal_auto);
      if (auto) {
        nextGoals = {
          calories: suggested.calories,
          protein_g: suggested.protein_g,
          carbs_g: suggested.carbs_g,
          fat_g: suggested.fat_g,
        };
        if (!matchesSuggestion(g, tdeeRes.tdee, tdeeRes.weight, proteinFactor)) {
          await supabase.from("goals").upsert(
            { user_id: user.id, ...suggested, goal_auto: true, protein_factor: proteinFactor },
            { onConflict: "user_id" },
          );
        }
      }
    }

    setUserGoals(nextGoals);

    await loadLibrary();
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  const ensureMeal = async (type: string): Promise<Meal> => {
    // 1) Fast path: já temos pela do dia carregada.
    const existing = meals.find((m) => m.meal_type === type);
    if (existing) return existing;
    // 2) Sem estar no estado (ex.: refeição criada pelo chat/outra aba depois do
    //    load), consulta o BANCO antes de inserir — assim não cria uma segunda
    //    refeição do mesmo tipo no mesmo dia (que ficaria invisível na tela,
    //    mas seria somada no card de calorias e no coach).
    const { data: inDb } = await supabase
      .from("meals")
      .select("id,meal_type,meal_date")
      .eq("user_id", user!.id)
      .eq("meal_date", today)
      .eq("meal_type", type)
      .maybeSingle();
    if (inDb) return inDb;
    // 3) Não existe — cria. O índice único (user_id, meal_date, meal_type)
    //    adicionado na migração de dedupe barra corridas concorrentes.
    const { data: newMeal, error } = await supabase
      .from("meals")
      .insert({ user_id: user!.id, meal_type: type, meal_date: today })
      .select("id,meal_type,meal_date")
      .single();
    if (error) {
      // Caso raro de corrida: outro registro ganhou primeiro — usa dele.
      if (error.code === "23505") {
        const { data: won } = await supabase
          .from("meals")
          .select("id,meal_type,meal_date")
          .eq("user_id", user!.id)
          .eq("meal_date", today)
          .eq("meal_type", type)
          .maybeSingle();
        if (won) return won;
      }
      throw error;
    }
    return newMeal as Meal;
  };

  const addFood = async () => {
    await guard(async () => {
    if (!user || !query.trim()) return;
    setLoading(true);
    try {
      const macros = manual
        ? {
            name: query.trim(),
            calories: Number(mCal) || 0,
            protein_g: Number(mProt) || 0,
            carbs_g: Number(mCarb) || 0,
            fat_g: Number(mFat) || 0,
          }
        : await lookupNutrition({
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : undefined,
            data: { query: query.trim(), grams: Number(grams) || 100 },
          });

      const meal = await ensureMeal(mealType);
      const { error: e2 } = await supabase.from("meal_items").insert({
        user_id: user.id,
        meal_id: meal.id,
        name: macros.name,
        grams: Number(grams) || 0,
        calories: macros.calories,
        protein_g: macros.protein_g,
        carbs_g: macros.carbs_g,
        fat_g: macros.fat_g,
      });
      if (e2) throw e2;

      toast.success(`${macros.name} adicionado`);
      setQuery("");
      setGrams(100);
      setMCal("");
      setMProt("");
      setMCarb("");
      setMFat("");
      setBarcodePortionLabel("");
      setBarcodePortionSource("");
      setRefGrams(null);
      setLibQuery("");
      setOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao buscar alimento");
    } finally {
      setLoading(false);
    }
    });
  };

  // Salva o alimento preenchido no modal (scanner, busca manual ou IA) na biblioteca pessoal.
  // Payload espelha o insert do FoodLibrary. Dedup por nome (case-insensitive).
  const saveToLibrary = async () => {
    if (!user || !query.trim()) return;
    const name = query.trim();
    try {
      const { data: existing } = await supabase
        .from("food_library")
        .select("id")
        .eq("user_id", user.id)
        .ilike("name", name);
      if (existing && existing.length > 0) {
        toast.error(`"${name}" já existe na biblioteca`);
        return;
      }
      const { error } = await supabase.from("food_library").insert({
        user_id: user.id,
        name,
        category: "Outros",
        grams: Number(grams) || 100,
        calories: Number(mCal) || 0,
        protein_g: Number(mProt) || 0,
        carbs_g: Number(mCarb) || 0,
        fat_g: Number(mFat) || 0,
      });
      if (error) throw error;
      toast.success(`"${name}" salvo na biblioteca`);
      await loadLibrary();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar na biblioteca");
    }
  };

  const addRecent = async (it: Item) => {
    await guard(async () => {
    if (!user) return;
    try {
      const meal = await ensureMeal(mealType);
      await supabase.from("meal_items").insert({
        user_id: user.id,
        meal_id: meal.id,
        name: it.name,
        grams: Number(it.grams),
        calories: Number(it.calories),
        protein_g: Number(it.protein_g),
        carbs_g: Number(it.carbs_g),
        fat_g: Number(it.fat_g),
      });
      toast.success(`${it.name} adicionado em ${mealType}`);
      load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro");
    }
    });
  };

  const toggleFavorite = async (it: Item) => {
    if (!user) return;
    const existing = favorites.find(
      (f) => f.name.toLowerCase().trim() === it.name.toLowerCase().trim(),
    );
    if (existing) {
      await supabase.from("favorite_foods").delete().eq("id", existing.id);
      toast.success("Removido dos favoritos");
    } else {
      await supabase.from("favorite_foods").insert({
        user_id: user.id,
        name: it.name,
        grams: Number(it.grams),
        calories: Number(it.calories),
        protein_g: Number(it.protein_g),
        carbs_g: Number(it.carbs_g),
        fat_g: Number(it.fat_g),
      });
      toast.success("Favoritado ⭐");
    }
    load();
  };

  const isFav = (name: string) =>
    favorites.some((f) => f.name.toLowerCase().trim() === name.toLowerCase().trim());

  const addFavoriteToMeal = async (f: (typeof favorites)[number]) => {
    await guard(async () => {
    if (!user) return;
    const meal = await ensureMeal(mealType);
    await supabase.from("meal_items").insert({
      user_id: user.id,
      meal_id: meal.id,
      name: f.name,
      grams: f.grams,
      calories: f.calories,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
    });
    toast.success(`${f.name} adicionado em ${mealType}`);
    load();
    });
  };

  const removeItem = async (id: string) => {
    await supabase.from("meal_items").delete().eq("id", id);
    await load();
  };

  const removeMeal = async (mealId: string) => {
    if (!confirm("Excluir esta refeição e todos os alimentos?")) return;
    await supabase.from("meal_items").delete().eq("meal_id", mealId);
    await supabase.from("meals").delete().eq("id", mealId);
    await load();
  };

  const onPickPhoto = async (file: File) => {
    setPhotoLoading(true);
    setPhotoItems([]);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const img = new Image();
        const r = new FileReader();
        r.onload = (e) => {
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;
            const maxSize = 800; // Resize to max 800px to save tokens and bandwidth

            if (width > height && width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Canvas não suportado"));
            ctx.drawImage(img, 0, 0, width, height);
            
            // Compress with JPEG at 70% quality
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          };
          img.src = e.target?.result as string;
        };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await analyzePhoto({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: { imageBase64: dataUrl },
      });
      setPhotoItems(res.items.map((i) => ({ ...i, selected: true })));
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao analisar foto");
    } finally {
      setPhotoLoading(false);
    }
  };

  const confirmPhotoItems = async () => {
    await guard(async () => {
    if (!user) return;
    const sel = photoItems.filter((i) => i.selected);
    if (sel.length === 0) return;
    try {
      const meal = await ensureMeal(photoMeal);
      const rows = sel.map((i) => ({
        user_id: user.id,
        meal_id: meal.id,
        name: i.name,
        grams: i.grams,
        calories: i.calories,
        protein_g: i.protein_g,
        carbs_g: i.carbs_g,
        fat_g: i.fat_g,
      }));
      const { error } = await supabase.from("meal_items").insert(rows);
      if (error) throw error;
      toast.success(`${sel.length} itens adicionados em ${photoMeal}`);
      setPhotoOpen(false);
      setPhotoItems([]);
      load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro");
    }
    });
  };

  const duplicateYesterday = async (type: string) => {
    await guard(async () => {
    if (!user) return;
    const y = getLocalDateMinusDays(1);
    const { data: yMeal } = await supabase
      .from("meals")
      .select("id")
      .eq("user_id", user.id)
      .eq("meal_date", y)
      .eq("meal_type", type)
      .maybeSingle();
    if (!yMeal) return toast.error(`Sem ${type.toLowerCase()} ontem`);
    const { data: yItems } = await supabase.from("meal_items").select("*").eq("meal_id", yMeal.id);
    if (!yItems || yItems.length === 0) return toast.error("Refeição vazia");

    const meal = await ensureMeal(type);
    const rows = yItems.map((it) => ({
      user_id: user.id,
      meal_id: meal.id,
      name: it.name,
      grams: it.grams,
      calories: it.calories,
      protein_g: it.protein_g,
      carbs_g: it.carbs_g,
      fat_g: it.fat_g,
    }));
    await supabase.from("meal_items").insert(rows);
    toast.success(`${type} de ontem copiado`);
    load();
    });
  };

  const openEdit = (it: Item) => {
    setEditItem(it);
    setEditGrams(Number(it.grams));
  };

  const saveEdit = async () => {
    if (!editItem || editGrams === "" || editGrams <= 0) return;
    const ratio = Number(editGrams) / Number(editItem.grams);
    const { error } = await supabase
      .from("meal_items")
      .update({
        grams: Number(editGrams),
        calories: Number(editItem.calories) * ratio,
        protein_g: Number(editItem.protein_g) * ratio,
        carbs_g: Number(editItem.carbs_g) * ratio,
        fat_g: Number(editItem.fat_g) * ratio,
      })
      .eq("id", editItem.id);
    if (error) return toast.error(error.message);
    toast.success("Quantidade ajustada");
    setEditItem(null);
    load();
  };

  const filteredLibrary = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter((f) => f.name.toLowerCase().includes(q));
  }, [library, libQuery]);

  const grouped = useMemo(
    () =>
      MEAL_TYPES.map((type) => {
        const meal = meals.find((m) => m.meal_type === type);
        const its = meal ? items.filter((i) => i.meal_id === meal.id) : [];
        return { type, items: its };
      }),
    [meals, items],
  );

  const consumed = useMemo(() => {
    return items.reduce(
      (acc, item) => ({
        calories: acc.calories + Number(item.calories || 0),
        protein_g: acc.protein_g + Number(item.protein_g || 0),
        carbs_g: acc.carbs_g + Number(item.carbs_g || 0),
        fat_g: acc.fat_g + Number(item.fat_g || 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
  }, [items]);

  const remainingMacros = useMemo(() => {
    return {
      calories: userGoals.calories - consumed.calories,
      protein_g: userGoals.protein_g - consumed.protein_g,
      carbs_g: userGoals.carbs_g - consumed.carbs_g,
      fat_g: userGoals.fat_g - consumed.fat_g,
    };
  }, [userGoals, consumed]);

  const caloricState = useMemo(() => {
    const diff = consumed.calories - userGoals.calories;
    if (diff < -100) {
      return {
        label: `Déficit (${Math.abs(Math.round(diff))} kcal)`,
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        Icon: TrendingDown,
      };
    }
    if (diff > 100) {
      return {
        label: `Superávit (+${Math.round(diff)} kcal)`,
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        Icon: TrendingUp,
      };
    }
    return {
      label: "Manutenção Calórica",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      Icon: Minus,
    };
  }, [consumed.calories, userGoals.calories]);

  const visibleGroups = grouped.filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-display font-bold">Nutrição</h1>
          <p className="text-sm text-muted-foreground">Diário alimentar de hoje</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0 max-w-[56%]">
            <Button
              size="icon"
              variant="ghost"
              title="O que posso comer agora? (Sugestão IA)"
              onClick={() => setSuggestOpen(true)}
            >
              <Sparkles className="h-5 w-5 text-primary" />
            </Button>
            <Link to="/app/nutricao-historico">
              <Button size="icon" variant="ghost" title="Visão geral">
                <BarChart3 className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/app/receitas">
              <Button size="icon" variant="ghost" title="Receitas">
                <ChefHat className="h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="icon"
              variant="ghost"
              title="Código de barras"
              onClick={() => setScanOpen(true)}
              disabled={scanLoading}
            >
              {scanLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Barcode className="h-5 w-5" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Registrar por voz"
              onClick={() => setVoiceOpen(true)}
            >
              <Mic className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Registro rápido (Fora de casa)"
              onClick={() => setQuickAddOpen(true)}
            >
              <Zap className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Foto do prato"
              onClick={() => setPhotoOpen(true)}
            >
              <Camera className="h-5 w-5" />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost" title="Adicionar alimento">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Adicionar alimento
                </DialogTitle>
                {barcodePortionLabel && (
                  <div
                    className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium ${
                      barcodePortionSource === "barcode"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : barcodePortionSource === "ai"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {barcodePortionLabel}
                  </div>
                )}
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Refeição</Label>
                  <Select value={mealType} onValueChange={setMealType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {recent.length > 0 && (
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Star className="h-3 w-3" /> Recentes
                    </Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {recent.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            addRecent(r);
                            setOpen(false);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                        >
                          {r.name} <span className="text-muted-foreground">·{r.grams}g</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {favorites.length > 0 && (
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Heart className="h-3 w-3 text-primary" /> Favoritos
                    </Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {favorites.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            addFavoriteToMeal(f);
                            setOpen(false);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                        >
                          {f.name} <span className="opacity-60">·{Math.round(f.grams)}g</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Alimento</Label>
                  <Input
                    placeholder="Ex: arroz branco cozido…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setRefGrams(null); // macros não correspondem mais à porção de referência
                    }}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Library className="h-3 w-3" /> Da sua biblioteca
                  </Label>
                  <Input
                    className="mt-1.5"
                    placeholder="Buscar na minha biblioteca…"
                    value={libQuery}
                    onChange={(e) => setLibQuery(e.target.value)}
                  />
                  {library.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Nenhum alimento na biblioteca. Toque em "Salvar na biblioteca" ao adicionar um
                      alimento novo.
                    </p>
                  ) : (
                    <div className="mt-1.5 max-h-48 overflow-y-auto space-y-1.5 rounded-lg border p-2">
                      {filteredLibrary.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1 text-center">
                          Nenhum alimento encontrado.
                        </p>
                      ) : (
                        filteredLibrary.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setQuery(f.name);
                              setGrams(f.grams);
                              setMCal(f.calories);
                              setMProt(f.protein_g);
                              setMCarb(f.carbs_g);
                              setMFat(f.fat_g);
                              setManual(true);
                              setRefGrams(f.grams);
                              setBarcodePortionLabel("");
                              setBarcodePortionSource("");
                            }}
                            className="w-full text-left rounded-md px-2.5 py-1.5 text-xs hover:bg-secondary/70 transition-colors"
                          >
                            <span className="font-medium">{f.name}</span>
                            <span className="text-muted-foreground">
                              {" "}· {f.grams}g · {Math.round(f.calories)} kcal · P {f.protein_g} · C{" "}
                              {f.carbs_g} · G {f.fat_g}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Porção (g)</Label>
                  <Input
                    type="number"
                    value={grams}
                    onChange={(e) => {
                      const v = e.target.value === "" ? "" : Number(e.target.value);
                      setGrams(v);
                      if (refGrams !== null && typeof v === "number" && v > 0) {
                        const scaled = rescaleMacros(
                          { calories: mCal, protein_g: mProt, carbs_g: mCarb, fat_g: mFat },
                          refGrams,
                          v,
                        );
                        setMCal(scaled.calories);
                        setMProt(scaled.protein_g);
                        setMCarb(scaled.carbs_g);
                        setMFat(scaled.fat_g);
                        setRefGrams(v);
                      }
                    }}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[50, 100, 150, 200, 250, 300].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          setGrams(g);
                          if (refGrams !== null && g > 0) {
                            const scaled = rescaleMacros(
                              { calories: mCal, protein_g: mProt, carbs_g: mCarb, fat_g: mFat },
                              refGrams,
                              g,
                            );
                            setMCal(scaled.calories);
                            setMProt(scaled.protein_g);
                            setMCarb(scaled.carbs_g);
                            setMFat(scaled.fat_g);
                            setRefGrams(g);
                          }
                        }}
                        className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                          grams === g
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
                        }`}
                      >
                        {g}g
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Label
                    htmlFor="manual-macros"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Inserir macros manualmente (rótulo)
                  </Label>
                  <input
                    id="manual-macros"
                    type="checkbox"
                    checked={manual}
                    onChange={(e) => setManual(e.target.checked)}
                    className="h-4 w-4"
                  />
                </div>
                {manual && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Kcal</Label>
                      <Input
                        type="number"
                        value={mCal}
                        onChange={(e) =>
                          setMCal(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Proteína (g)</Label>
                      <Input
                        type="number"
                        value={mProt}
                        onChange={(e) =>
                          setMProt(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Carbo (g)</Label>
                      <Input
                        type="number"
                        value={mCarb}
                        onChange={(e) =>
                          setMCarb(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Gordura (g)</Label>
                      <Input
                        type="number"
                        value={mFat}
                        onChange={(e) =>
                          setMFat(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={saveToLibrary}
                    disabled={loading || !query.trim() || mCal === ""}
                    className="flex-1"
                  >
                    <Apple className="h-4 w-4 mr-1" /> Salvar na biblioteca
                  </Button>
                  <Button onClick={addFood} disabled={loading || !query.trim()} className="flex-1">
                    {loading
                      ? "Calculando macros…"
                      : manual
                        ? "Adicionar"
                        : "Calcular com IA e adicionar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {/* end header section */}

      {/* Photo analyze dialog */}
      <Dialog
        open={photoOpen}
        onOpenChange={(o) => {
          setPhotoOpen(o);
          if (!o) setPhotoItems([]);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Foto do prato
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Refeição</Label>
              <Select value={photoMeal} onValueChange={setPhotoMeal}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer hover:bg-secondary/30 transition-colors">
              {photoLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-sm text-muted-foreground">
                {photoLoading ? "Analisando…" : "Tirar foto ou enviar imagem"}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={photoLoading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickPhoto(f);
                }}
              />
            </label>
            {photoItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Itens detectados
                </p>
                {photoItems.map((i, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg border p-2">
                    <input
                      type="checkbox"
                      checked={i.selected}
                      onChange={(e) =>
                        setPhotoItems((arr) =>
                          arr.map((x, j) => (j === idx ? { ...x, selected: e.target.checked } : x)),
                        )
                      }
                      className="mt-1 h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(i.grams)}g · {Math.round(i.calories)} kcal · P{" "}
                        {Math.round(i.protein_g)} · C {Math.round(i.carbs_g)} · G{" "}
                        {Math.round(i.fat_g)}
                      </p>
                    </div>
                  </div>
                ))}
                <Button onClick={confirmPhotoItems} className="w-full">
                  Adicionar selecionados
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onBarcode} />

      {/* Edit quantity dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar quantidade</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{editItem.name}</p>
              <div>
                <Label>Porção (g)</Label>
                <Input
                  type="number"
                  value={editGrams}
                  onChange={(e) => setEditGrams(e.target.value === "" ? "" : Number(e.target.value))}
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[50, 100, 150, 200, 250, 300].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setEditGrams(g)}
                      className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                        editGrams === g
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
                      }`}
                    >
                      {g}g
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Macros serão recalculados proporcionalmente.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resumo Nutricional do Dia */}
      <Card className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                Consumo Diário
              </p>
              <div
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${caloricState.className}`}
              >
                <caloricState.Icon className="h-3 w-3" />
                <span>{caloricState.label}</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl sm:text-3xl font-display font-extrabold text-foreground">
                {Math.round(consumed.calories)}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground">
                / {userGoals.calories} kcal
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
              Restantes
            </p>
            <p
              className={`text-lg sm:text-xl font-display font-bold mt-0.5 ${
                remainingMacros.calories < 0 ? "text-destructive" : "text-primary"
              }`}
            >
              {remainingMacros.calories < 0
                ? `${Math.round(remainingMacros.calories)} kcal (Excedido)`
                : `${Math.round(remainingMacros.calories)} kcal`}
            </p>
          </div>
        </div>

        {/* Barra de Progresso de Calorias */}
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              remainingMacros.calories < 0 ? "bg-destructive" : "bg-primary"
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, (consumed.calories / userGoals.calories) * 100))}%`,
            }}
          />
        </div>

        {/* Breakdown de Macros */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
          <div className="rounded-xl bg-secondary/50 p-2">
            <span className="block text-muted-foreground text-[10px]">Proteína</span>
            <span className="font-bold text-foreground">
              {Math.round(consumed.protein_g)} / {userGoals.protein_g}g
            </span>
          </div>
          <div className="rounded-xl bg-secondary/50 p-2">
            <span className="block text-muted-foreground text-[10px]">Carbo</span>
            <span className="font-bold text-foreground">
              {Math.round(consumed.carbs_g)} / {userGoals.carbs_g}g
            </span>
          </div>
          <div className="rounded-xl bg-secondary/50 p-2">
            <span className="block text-muted-foreground text-[10px]">Gordura</span>
            <span className="font-bold text-foreground">
              {Math.round(consumed.fat_g)} / {userGoals.fat_g}g
            </span>
          </div>
        </div>

        {/* Item 4 — Distribuição % de Macros */}
        {(() => {
          const pKcal = consumed.protein_g * 4;
          const cKcal = consumed.carbs_g * 4;
          const fKcal = consumed.fat_g * 9;
          const total = pKcal + cKcal + fKcal;
          if (total <= 0) return null;
          const pPct = Math.round((pKcal / total) * 100);
          const cPct = Math.round((cKcal / total) * 100);
          const fPct = 100 - pPct - cPct;
          return (
            <div className="pt-1 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Distribuição de Macros (%)
              </p>
              <div className="flex h-3 w-full rounded-full overflow-hidden gap-px">
                <div
                  title={`Proteína ${pPct}%`}
                  className="bg-blue-500 transition-all duration-500"
                  style={{ width: `${pPct}%` }}
                />
                <div
                  title={`Carboidrato ${cPct}%`}
                  className="bg-amber-400 transition-all duration-500"
                  style={{ width: `${cPct}%` }}
                />
                <div
                  title={`Gordura ${fPct}%`}
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${fPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />P {pPct}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />C {cPct}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />G {fPct}%
                </span>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Item 5 — Mini-Card de Insights do Coach IA */}
      {(() => {
        const tips: { key: string; msg: string }[] = [];
        const hour = new Date().getHours();
        const protRatio =
          userGoals.protein_g > 0 ? consumed.protein_g / userGoals.protein_g : 1;
        const remCal = remainingMacros.calories;

        // Gatilho 1: tarde (>=16h) e proteína < 50% da meta
        if (hour >= 16 && protRatio < 0.5 && consumed.calories > 0) {
          tips.push({
            key: "prot",
            msg: `Você consumiu apenas ${Math.round(protRatio * 100)}% da meta de proteína hoje. Inclua uma fonte magra no lanche da tarde ou no jantar.`,
          });
        }

        // Gatilho 2: calorias restantes baixas (<=200 kcal) antes do jantar (<20h)
        if (remCal > 0 && remCal <= 200 && hour < 20 && consumed.calories > 0) {
          tips.push({
            key: "cal",
            msg: `Seu saldo restante está em ${Math.round(remCal)} kcal. Prefira uma refeição leve rica em fibras e proteína no jantar.`,
          });
        }

        // Gatilho 3: excedeu calorias
        if (remCal < -150 && consumed.calories > 0) {
          tips.push({
            key: "over",
            msg: `Você excedeu a meta em ${Math.abs(Math.round(remCal))} kcal. Priorize hidratação e movimentação leve no restante do dia.`,
          });
        }

        if (tips.length === 0) return null;
        return (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs font-semibold text-primary">Dica do Coach</p>
            </div>
            {tips.map((t) => (
              <p key={t.key} className="text-xs text-muted-foreground leading-relaxed">
                {t.msg}
              </p>
            ))}
          </div>
        );
      })()}

      {visibleGroups.length === 0 ? (
        <Card className="p-10 text-center">
          <Apple className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">Nenhuma refeição registrada hoje.</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {MEAL_TYPES.map((t) => (
              <Button key={t} variant="outline" size="sm" onClick={() => duplicateYesterday(t)}>
                <Copy className="h-3 w-3 mr-1" /> {t} de ontem
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ type, items: its }) => (
            <div key={type}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-xs uppercase tracking-wide text-muted-foreground">{type}</h2>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Copiar de ontem"
                    onClick={() => duplicateYesterday(type)}
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  {its.length > 0 &&
                    (() => {
                      const meal = meals.find((m) => m.meal_type === type);
                      return meal ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeMeal(meal.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : null;
                    })()}
                </div>
              </div>
              {its.length > 0 && (
                <Card className="divide-y">
                  {its.map((i) => (
                    <div key={i.id} className="p-3 flex items-center justify-between gap-3">
                      <button className="min-w-0 flex-1 text-left" onClick={() => openEdit(i)}>
                        <p className="font-medium truncate">{i.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.grams}g · {Math.round(Number(i.calories))} kcal · P{" "}
                          {Math.round(Number(i.protein_g))} · C {Math.round(Number(i.carbs_g))} · G{" "}
                          {Math.round(Number(i.fat_g))}
                        </p>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(i)}
                        title="Ajustar quantidade"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleFavorite(i)}
                        title="Favoritar"
                      >
                        <Heart
                          className={`h-4 w-4 ${isFav(i.name) ? "fill-primary text-primary" : "text-muted-foreground"}`}
                        />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(i.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      <FoodLibrary
        user={user}
        session={session}
        mealTypes={MEAL_TYPES}
        defaultMealType={MEAL_TYPES[0]}
        existingMealTypes={meals.map((m) => m.meal_type)}
        ensureMeal={ensureMeal}
        onItemAdded={load}
      />

      <VoiceMealRecorder
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        session={session}
        onSaved={load}
      />

      <SuggestMealDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        session={session}
        user={user}
        remaining={remainingMacros}
        ensureMeal={ensureMeal}
        onMealAdded={load}
      />

      <QuickAddMealDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        user={user}
        ensureMeal={ensureMeal}
        onMealAdded={load}
      />
    </div>
  );
}
