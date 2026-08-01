import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Library,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Pencil,
  Download,
  ChevronDown,
  Loader2,
  Apple,
} from "lucide-react";
import { lookupNutrition } from "@/server-fns/nutrition.functions";
import { FOOD_PACK, FOOD_CATEGORIES } from "@/lib/food-pack-taco";
import { toast } from "sonner";

type Props = {
  user: { id: string } | null;
  session: { access_token?: string } | null;
  mealTypes: string[];
  defaultMealType: string;
  existingMealTypes: string[];
  ensureMeal: (type: string) => Promise<{ id: string; meal_type: string; meal_date: string }>;
  onItemAdded: () => void;
};

type LibraryFood = {
  id: string;
  name: string;
  category: string | null;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function FoodLibrary({
  user,
  session,
  mealTypes,
  defaultMealType,
  existingMealTypes,
  ensureMeal,
  onItemAdded,
}: Props) {
  const [library, setLibrary] = useState<LibraryFood[]>([]);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);

  // criar / editar alimento
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryFood | null>(null);
  const [fName, setFName] = useState("");
  const [fCategory, setFCategory] = useState<string>(FOOD_CATEGORIES[0]);
  const [fGrams, setFGrams] = useState<number | "">(100);
  const [fCal, setFCal] = useState<number | "">("");
  const [fProt, setFProt] = useState<number | "">("");
  const [fCarb, setFCarb] = useState<number | "">("");
  const [fFat, setFFat] = useState<number | "">("");
  const [aiLoading, setAiLoading] = useState(false);

  // adicionar à refeição
  const [addTarget, setAddTarget] = useState<LibraryFood | null>(null);
  const [addMealType, setAddMealType] = useState(defaultMealType);
  const [addGrams, setAddGrams] = useState<number | "">(100);

  const loadLibrary = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("food_library")
      .select("id,name,category,grams,calories,protein_g,carbs_g,fat_g")
      .eq("user_id", user.id)
      .order("name");
    setLibrary((data ?? []) as LibraryFood[]);
  };

  useEffect(() => {
    loadLibrary(); /* eslint-disable-next-line */
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.category ?? "").toLowerCase().includes(q),
    );
  }, [library, search]);

  const importPack = async () => {
    if (!user) return;
    setImporting(true);
    try {
      const { data: existing } = await supabase
        .from("food_library")
        .select("name")
        .eq("user_id", user.id);
      const names = new Set((existing ?? []).map((r) => (r.name as string).toLowerCase().trim()));
      const toInsert = FOOD_PACK.filter((f) => !names.has(f.name.toLowerCase().trim())).map(
        (f) => ({
          user_id: user.id,
          name: f.name,
          category: f.category,
          grams: 100,
          calories: f.calories,
          protein_g: f.protein_g,
          carbs_g: f.carbs_g,
          fat_g: f.fat_g,
        }),
      );
      if (toInsert.length === 0) {
        toast("Sua biblioteca já tem todos os alimentos do pack.");
        return;
      }
      const { error } = await supabase.from("food_library").insert(toInsert);
      if (error) throw error;
      toast.success(`${toInsert.length} alimentos importados`);
      await loadLibrary();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao importar pack");
    } finally {
      setImporting(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFName("");
    setFCategory(FOOD_CATEGORIES[0]);
    setFGrams(100);
    setFCal("");
    setFProt("");
    setFCarb("");
    setFFat("");
    setFormOpen(true);
  };

  const openEdit = (f: LibraryFood) => {
    setEditing(f);
    setFName(f.name);
    setFCategory(f.category ?? FOOD_CATEGORIES[0]);
    setFGrams(f.grams);
    setFCal(f.calories);
    setFProt(f.protein_g);
    setFCarb(f.carbs_g);
    setFFat(f.fat_g);
    setFormOpen(true);
  };

  const calcWithAi = async () => {
    if (!fName.trim()) return toast.error("Digite o nome do alimento primeiro");
    setAiLoading(true);
    try {
      const macros = await lookupNutrition({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: { query: fName.trim(), grams: Number(fGrams) || 100 },
      });
      setFName(macros.name);
      setFCal(macros.calories);
      setFProt(macros.protein_g);
      setFCarb(macros.carbs_g);
      setFFat(macros.fat_g);
      toast.success("Macros calculados pela IA");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao calcular macros");
    } finally {
      setAiLoading(false);
    }
  };

  const saveForm = async () => {
    if (!user || !fName.trim()) return;
    const payload = {
      name: fName.trim(),
      category: fCategory,
      grams: Number(fGrams) || 100,
      calories: Number(fCal) || 0,
      protein_g: Number(fProt) || 0,
      carbs_g: Number(fCarb) || 0,
      fat_g: Number(fFat) || 0,
    };
    try {
      if (editing) {
        const { error } = await supabase.from("food_library").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Alimento atualizado");
      } else {
        const { error } = await supabase
          .from("food_library")
          .insert({ user_id: user.id, ...payload });
        if (error) throw error;
        toast.success(`${payload.name} adicionado à biblioteca`);
      }
      setFormOpen(false);
      await loadLibrary();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar alimento");
    }
  };

  const removeFood = async (id: string, name: string) => {
    if (!confirm(`Excluir "${name}" da biblioteca?`)) return;
    await supabase.from("food_library").delete().eq("id", id);
    toast.success("Alimento removido da biblioteca");
    loadLibrary();
  };

  const openAdd = (f: LibraryFood) => {
    setAddTarget(f);
    setAddGrams(f.grams);
    setAddMealType(
      existingMealTypes.find((t) => t === defaultMealType) ??
        existingMealTypes[0] ??
        defaultMealType,
    );
  };

  const confirmAdd = async () => {
    if (!user || !addTarget) return;
    const grams = Number(addGrams);
    if (!Number.isFinite(grams) || grams <= 0) return;
    try {
      const meal = await ensureMeal(addMealType);
      const ratio = grams / addTarget.grams;
      const { error } = await supabase.from("meal_items").insert({
        user_id: user.id,
        meal_id: meal.id,
        name: addTarget.name,
        grams,
        calories: Math.round(addTarget.calories * ratio),
        protein_g: round1(addTarget.protein_g * ratio),
        carbs_g: round1(addTarget.carbs_g * ratio),
        fat_g: round1(addTarget.fat_g * ratio),
      });
      if (error) throw error;
      toast.success(`${addTarget.name} adicionado em ${addMealType}`);
      setAddTarget(null);
      onItemAdded();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar");
    }
  };

  const preview = useMemo(() => {
    if (!addTarget) return null;
    const grams = Number(addGrams);
    const ratio = Number.isFinite(grams) && grams > 0 ? grams / addTarget.grams : 1;
    return {
      calories: Math.round(addTarget.calories * ratio),
      protein_g: round1(addTarget.protein_g * ratio),
      carbs_g: round1(addTarget.carbs_g * ratio),
      fat_g: round1(addTarget.fat_g * ratio),
    };
  }, [addTarget, addGrams]);

  return (
    <Card>
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 p-4 text-left"
          >
            <span className="flex items-center gap-2 font-medium">
              <Library className="h-4 w-4 text-primary" /> Meus alimentos
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreate();
                }}
              >
                <Plus className="h-3 w-3 mr-1" /> Novo
              </Button>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3">
            {library.length === 0 ? (
              <Card className="p-6 text-center">
                <Apple className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  Nenhum alimento na biblioteca. Importe um pack de alimentos comuns (valores TACO)
                  ou adicione o seu.
                </p>
                <Button onClick={importPack} disabled={importing} size="sm">
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Importar pack de alimentos
                </Button>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Buscar alimento…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={importPack}
                    disabled={importing}
                    title="Importar pack de alimentos comuns"
                  >
                    {importing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    Nenhum alimento encontrado.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {filtered.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => openAdd(f)}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{f.name}</p>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                            {f.category && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {f.category}
                              </Badge>
                            )}
                            <span>
                              {Math.round(f.grams)}g · {Math.round(f.calories)} kcal
                              {f.protein_g > 0 && ` · P ${f.protein_g}`}
                              {f.carbs_g > 0 && ` · C ${f.carbs_g}`}
                              {f.fat_g > 0 && ` · G ${f.fat_g}`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(f);
                            }}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Remover"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFood(f.id, f.name);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Adicionar à refeição */}
      <Dialog open={!!addTarget} onOpenChange={(o) => !o && setAddTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à refeição</DialogTitle>
          </DialogHeader>
          {addTarget && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{addTarget.name}</p>
              <div>
                <Label>Refeição</Label>
                <Select value={addMealType} onValueChange={setAddMealType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mealTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Porção (g)</Label>
                <Input
                  type="number"
                  autoFocus
                  value={addGrams}
                  onChange={(e) => setAddGrams(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              {preview && (
                <p className="text-xs text-muted-foreground">
                  {preview.calories} kcal · P {preview.protein_g} · C {preview.carbs_g} · G{" "}
                  {preview.fat_g}
                </p>
              )}
              <Button
                className="w-full"
                onClick={confirmAdd}
                disabled={addGrams === "" || Number(addGrams) <= 0}
              >
                Adicionar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Criar / editar alimento */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar alimento" : "Novo alimento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                placeholder="Ex: arroz branco cozido…"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={fCategory} onValueChange={setFCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOOD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Porção de referência (g)</Label>
              <Input
                type="number"
                value={fGrams}
                onChange={(e) => setFGrams(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Macros abaixo valem para essa porção. Ao adicionar, você poderá mudar a quantidade.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Kcal</Label>
                <Input
                  type="number"
                  value={fCal}
                  onChange={(e) => setFCal(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Proteína (g)</Label>
                <Input
                  type="number"
                  value={fProt}
                  onChange={(e) => setFProt(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Carbo (g)</Label>
                <Input
                  type="number"
                  value={fCarb}
                  onChange={(e) => setFCarb(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Gordura (g)</Label>
                <Input
                  type="number"
                  value={fFat}
                  onChange={(e) => setFFat(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={calcWithAi}
              disabled={aiLoading || !fName.trim()}
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              Calcular macros com IA
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={saveForm} disabled={!fName.trim()}>
              {editing ? "Salvar" : "Adicionar à biblioteca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
