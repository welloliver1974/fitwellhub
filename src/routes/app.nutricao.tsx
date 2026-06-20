import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
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
} from "lucide-react";
import { lookupNutrition, analyzePhoto } from "@/server-fns/nutrition.functions";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";

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

const MEAL_TYPES = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"];

function parseFoodWeight(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return null;

  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|gramas?|grams?)?/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = (match[2] ?? "g").toLowerCase();
  if (unit.startsWith("kg")) return amount * 1000;
  return amount;
}

function scaleMacros(n: Record<string, unknown>, grams: number) {
  const ratio = grams / 100;
  const servingCalories = Number(n["energy-kcal_serving"] ?? n["energy_serving"]);
  const servingProtein = Number(n["proteins_serving"]);
  const servingCarbs = Number(n["carbohydrates_serving"]);
  const servingFat = Number(n["fat_serving"]);
  const hasServingMacros = [servingCalories, servingProtein, servingCarbs, servingFat].some(
    (v) => Number.isFinite(v) && v > 0,
  );

  if (hasServingMacros) {
    return {
      calories: Math.round(Number.isFinite(servingCalories) ? servingCalories : 0),
      protein_g: Math.round((Number.isFinite(servingProtein) ? servingProtein : 0) * 10) / 10,
      carbs_g: Math.round((Number.isFinite(servingCarbs) ? servingCarbs : 0) * 10) / 10,
      fat_g: Math.round((Number.isFinite(servingFat) ? servingFat : 0) * 10) / 10,
    };
  }

  return {
    calories: Math.round(Number(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0) * ratio),
    protein_g: Math.round(Number(n["proteins_100g"] ?? 0) * ratio * 10) / 10,
    carbs_g: Math.round(Number(n["carbohydrates_100g"] ?? 0) * ratio * 10) / 10,
    fat_g: Math.round(Number(n["fat_100g"] ?? 0) * ratio * 10) / 10,
  };
}

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

  const today = new Date().toISOString().slice(0, 10);

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
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  const ensureMeal = async (type: string): Promise<Meal> => {
    const existing = meals.find((m) => m.meal_type === type);
    if (existing) return existing;
    const { data: newMeal, error } = await supabase
      .from("meals")
      .insert({ user_id: user!.id, meal_type: type, meal_date: today })
      .select("id,meal_type,meal_date")
      .single();
    if (error) throw error;
    return newMeal as Meal;
  };

  const addFood = async () => {
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
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar alimento");
    } finally {
      setLoading(false);
    }
  };

  const addRecent = async (it: Item) => {
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
      toast.error(e instanceof Error ? e.message : "Erro");
    }
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
      toast.error(e instanceof Error ? e.message : "Erro ao analisar foto");
    } finally {
      setPhotoLoading(false);
    }
  };

  const confirmPhotoItems = async () => {
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
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const duplicateYesterday = async (type: string) => {
    if (!user) return;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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

  const grouped = useMemo(
    () =>
      MEAL_TYPES.map((type) => {
        const meal = meals.find((m) => m.meal_type === type);
        const its = meal ? items.filter((i) => i.meal_id === meal.id) : [];
        return { type, items: its };
      }),
    [meals, items],
  );

  const visibleGroups = grouped.filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Nutrição</h1>
          <p className="text-sm text-muted-foreground">Diário alimentar de hoje</p>
        </div>
        <div className="flex items-center gap-1">
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
            title="Foto do prato"
            onClick={() => setPhotoOpen(true)}
          >
            <Camera className="h-5 w-5" />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Plus className="h-4 w-4 mr-1" /> Alimento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Porção (g)</Label>
                  <Input
                    type="number"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value === "" ? "" : Number(e.target.value))}
                  />
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
                <Button onClick={addFood} disabled={loading || !query.trim()} className="w-full">
                  {loading
                    ? "Calculando macros…"
                    : manual
                      ? "Adicionar"
                      : "Calcular com IA e adicionar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Photo analyze dialog */}
      <Dialog
        open={photoOpen}
        onOpenChange={(o) => {
          setPhotoOpen(o);
          if (!o) setPhotoItems([]);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
        <DialogContent>
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
    </div>
  );
}
