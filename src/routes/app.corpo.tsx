import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Calendar,
  Clock,
  TrendingUp,
  Activity,
  User,
  Scale,
  Zap,
  Info,
  Camera,
} from "lucide-react";
import {
  calculateTdee,
  analyzeFullBodyStatus,
  analyzeBioimpedanceLog,
  analyzeBioimpedancePhoto,
} from "@/server-fns/corpo.functions";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/app/corpo")({
  component: CorpoPage,
});

type BioimpedanceLog = {
  id: string;
  log_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  bone_mass_kg: number | null;
  body_water_pct: number | null;
  visceral_fat: number | null;
  bmr_machine: number | null;
  metabolic_age: number | null;
  notes: string | null;
  created_at: string;
};

function calculateAge(birthDateStr: string): number {
  if (!birthDateStr) return 0;
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function CorpoPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();

  // Active Tab
  const [activeTab, setActiveTab] = useState("dados");

  // Profile Form State
  const [displayName, setDisplayName] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [heightCm, setHeightCm] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Latest Weight & Workout stats from Server
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(0);
  const [serverBmr, setServerBmr] = useState<number | null>(null);
  const [serverTdee, setServerTdee] = useState<number | null>(null);
  const [activityFactor, setActivityFactor] = useState<number | null>(null);

  // Full Body IA Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Bioimpedance Logs State
  const [bioLogs, setBioLogs] = useState<BioimpedanceLog[]>([]);
  const [isAddingBio, setIsAddingBio] = useState(false);

  // Bioimpedance Form State
  const [bioDate, setBioDate] = useState(new Date().toISOString().slice(0, 10));
  const [bioWeight, setBioWeight] = useState("");
  const [bioFat, setBioFat] = useState("");
  const [bioMuscle, setBioMuscle] = useState("");
  const [bioBone, setBioBone] = useState("");
  const [bioWater, setBioWater] = useState("");
  const [bioVisceral, setBioVisceral] = useState("");
  const [bioBmr, setBioBmr] = useState("");
  const [bioAge, setBioAge] = useState("");
  const [bioNotes, setBioNotes] = useState("");
  const [isSavingBio, setIsSavingBio] = useState(false);

  // Selected Bio Log for IA details
  const [selectedBioLog, setSelectedBioLog] = useState<BioimpedanceLog | null>(null);
  const [isAnalyzingBioLog, setIsAnalyzingBioLog] = useState(false);
  const [bioLogAnalysis, setBioLogAnalysis] = useState<string | null>(null);

  // Bioimpedance photo scanning
  const [isScanningBio, setIsScanningBio] = useState(false);

  // Load Data
  const loadProfileAndTdee = async () => {
    if (!user) return;
    try {
      // Load raw Profile to populate inputs
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, sex, height_cm, birth_date")
        .eq("id", user.id)
        .single();

      if (profile) {
        setDisplayName(profile.full_name || "");
        setSex((profile.sex as "male" | "female") || "");
        setHeightCm(profile.height_cm ? String(profile.height_cm) : "");
        setBirthDate(profile.birth_date || "");
      }

      // Load calculated values from server fn
      const res = await calculateTdee({
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (res) {
        setLatestWeight(res.weight);
        setSessionsPerWeek(res.sessionsPerWeek);
        setServerBmr(res.bmr);
        setServerTdee(res.tdee);
        setActivityFactor(res.activityFactor);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar dados do perfil.");
    }
  };

  const loadBioLogs = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("bioimpedance_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("log_date", { ascending: true }) // Ascending for Recharts LineChart chron order
        .limit(100);

      setBioLogs(
        (data ?? []).map((d) => ({
          ...d,
          weight_kg: d.weight_kg ? Number(d.weight_kg) : null,
          body_fat_pct: d.body_fat_pct ? Number(d.body_fat_pct) : null,
          muscle_mass_kg: d.muscle_mass_kg ? Number(d.muscle_mass_kg) : null,
          bone_mass_kg: d.bone_mass_kg ? Number(d.bone_mass_kg) : null,
          body_water_pct: d.body_water_pct ? Number(d.body_water_pct) : null,
          visceral_fat: d.visceral_fat ? Number(d.visceral_fat) : null,
          bmr_machine: d.bmr_machine ? Number(d.bmr_machine) : null,
          metabolic_age: d.metabolic_age ? Number(d.metabolic_age) : null,
        }))
      );
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar histórico de bioimpedância.");
    }
  };

  useEffect(() => {
    loadProfileAndTdee();
    loadBioLogs();
  }, [user]);

  // Handle Profile Save
  const saveProfile = async () => {
    if (!user) return;

    // Front-end Validations
    if (displayName.trim() === "") {
      toast.error("Por favor, preencha seu nome.");
      return;
    }

    if (sex === "") {
      toast.error("Por favor, selecione seu sexo biológico.");
      return;
    }

    const heightNum = Number(heightCm.replace(",", "."));
    if (isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
      toast.error("Altura deve estar entre 100 cm e 250 cm.");
      return;
    }

    if (!birthDate) {
      toast.error("Por favor, informe sua data de nascimento.");
      return;
    }

    const age = calculateAge(birthDate);
    if (age < 10 || age > 100) {
      toast.error("Idade deve estar entre 10 e 100 anos.");
      return;
    }

    try {
      setIsSavingProfile(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: displayName.trim(),
          sex: sex,
          height_cm: heightNum,
          birth_date: birthDate,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Perfil atualizado!");
      await loadProfileAndTdee();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar perfil.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Bioimpedance Save
  const saveBioimpedance = async () => {
    if (!user) return;

    const w = bioWeight ? Number(bioWeight.replace(",", ".")) : null;
    const f = bioFat ? Number(bioFat.replace(",", ".")) : null;
    const m = bioMuscle ? Number(bioMuscle.replace(",", ".")) : null;
    const b = bioBone ? Number(bioBone.replace(",", ".")) : null;
    const wa = bioWater ? Number(bioWater.replace(",", ".")) : null;
    const v = bioVisceral ? Number(bioVisceral.replace(",", ".")) : null;
    const bmrM = bioBmr ? Number(bioBmr) : null;
    const ageM = bioAge ? Number(bioAge) : null;

    if (w !== null && (w <= 30 || w > 300)) {
      toast.error("Peso deve ser entre 30 kg e 300 kg.");
      return;
    }
    if (f !== null && (f <= 2 || f > 70)) {
      toast.error("% Gordura deve ser entre 2% e 70%.");
      return;
    }
    if (m !== null && (m <= 10 || m > 200)) {
      toast.error("Massa muscular deve ser entre 10 kg e 200 kg.");
      return;
    }

    try {
      setIsSavingBio(true);
      const { error } = await supabase.from("bioimpedance_logs").insert({
        user_id: user.id,
        log_date: bioDate,
        weight_kg: w,
        body_fat_pct: f,
        muscle_mass_kg: m,
        bone_mass_kg: b,
        body_water_pct: wa,
        visceral_fat: v,
        bmr_machine: bmrM,
        metabolic_age: ageM,
        notes: bioNotes.trim() || null,
      });

      if (error) throw error;

      // If weight was logged in bioimpedance, also insert into body_weights for consistency
      if (w !== null) {
        await supabase.from("body_weights").insert({
          user_id: user.id,
          log_date: bioDate,
          weight_kg: w,
        });
      }

      toast.success("Bioimpedância registrada com sucesso!");
      setIsAddingBio(false);

      // Reset form
      setBioWeight("");
      setBioFat("");
      setBioMuscle("");
      setBioBone("");
      setBioWater("");
      setBioVisceral("");
      setBioBmr("");
      setBioAge("");
      setBioNotes("");

      await loadBioLogs();
      await loadProfileAndTdee();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao registrar bioimpedância.");
    } finally {
      setIsSavingBio(false);
    }
  };

  // Delete Bioimpedance Log
  const deleteBioLog = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta medição de bioimpedância?")) return;
    try {
      const { error } = await supabase.from("bioimpedance_logs").delete().eq("id", id);
      if (error) throw error;

      toast.success("Registro excluído.");
      await loadBioLogs();
      await loadProfileAndTdee();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir registro.");
    }
  };

  // Scan bioimpedance exam photo with IA
  const scanBioPhoto = async (file: File) => {
    setIsScanningBio(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const img = new Image();
        const r = new FileReader();
        r.onload = (e) => {
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;
            const maxSize = 800;
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
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          };
          img.src = e.target?.result as string;
        };
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const result = await analyzeBioimpedancePhoto({
        headers: { Authorization: `Bearer ${session?.access_token}` },
        data: { imageBase64: dataUrl },
      });

      let filled = 0;
      if (result.weight_kg !== null) { setBioWeight(String(result.weight_kg)); filled++; }
      if (result.body_fat_pct !== null) { setBioFat(String(result.body_fat_pct)); filled++; }
      if (result.muscle_mass_kg !== null) { setBioMuscle(String(result.muscle_mass_kg)); filled++; }
      if (result.bone_mass_kg !== null) { setBioBone(String(result.bone_mass_kg)); filled++; }
      if (result.body_water_pct !== null) { setBioWater(String(result.body_water_pct)); filled++; }
      if (result.visceral_fat !== null) { setBioVisceral(String(result.visceral_fat)); filled++; }
      if (result.bmr_machine !== null) { setBioBmr(String(result.bmr_machine)); filled++; }
      if (result.metabolic_age !== null) { setBioAge(String(result.metabolic_age)); filled++; }
      if (result.log_date !== null) { setBioDate(result.log_date); filled++; }

      toast.success(`${filled} de 9 campos preenchidos pela IA! Revise e salve.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao escanear exame.");
    } finally {
      setIsScanningBio(false);
    }
  };

  // Generate full diagnosis with IA
  const runFullAiDiagnosis = async () => {
    try {
      setIsAnalyzing(true);
      setAiAnalysis(null);
      const res = await analyzeFullBodyStatus({
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (res && res.analysis) {
        setAiAnalysis(res.analysis);
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao gerar diagnóstico.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate specific bio log AI analysis
  const runBioLogAiAnalysis = async (log: BioimpedanceLog) => {
    setSelectedBioLog(log);
    setBioLogAnalysis(null);
    try {
      setIsAnalyzingBioLog(true);
      const res = await analyzeBioimpedanceLog({
        data: { logId: log.id },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (res && res.analysis) {
        setBioLogAnalysis(res.analysis);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao analisar registro de bioimpedância.");
    } finally {
      setIsAnalyzingBioLog(false);
    }
  };

  // Recharts Chart Data Formatting (reverse ordered for chart chronology)
  const chartData = useMemo(() => {
    return bioLogs.map((log) => ({
      date: new Date(log.log_date + "T00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      fat: log.body_fat_pct ?? 0,
      muscle: log.muscle_mass_kg ?? 0,
      weight: log.weight_kg ?? 0,
    }));
  }, [bioLogs]);

  // Mifflin-St Jeor Local Calculation (dynamic check)
  const localBmr = useMemo(() => {
    if (!sex || !heightCm || !latestWeight || !birthDate) return null;
    const age = calculateAge(birthDate);
    const height = Number(heightCm.replace(",", "."));
    if (isNaN(height) || height < 100 || height > 250 || age < 10 || age > 100) return null;
    if (sex === "male") {
      return Math.round(10 * latestWeight + 6.25 * height - 5 * age + 5);
    } else {
      return Math.round(10 * latestWeight + 6.25 * height - 5 * age - 161);
    }
  }, [sex, heightCm, latestWeight, birthDate]);

  // TDEE Local Calculation
  const localTdee = useMemo(() => {
    if (!localBmr) return null;
    let factor = 1.2;
    if (sessionsPerWeek >= 1 && sessionsPerWeek < 3) {
      factor = 1.375;
    } else if (sessionsPerWeek >= 3 && sessionsPerWeek < 5) {
      factor = 1.55;
    } else if (sessionsPerWeek >= 5) {
      factor = 1.725;
    }
    return Math.round(localBmr * factor);
  }, [localBmr, sessionsPerWeek]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => navigate({ to: "/app" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight text-foreground">
            Perfil Corporal & Bioimpedância
          </h1>
          <p className="text-xs text-muted-foreground">
            Acompanhe seu metabolismo e evolução física avançada
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-secondary/50 p-1 mb-6">
          <TabsTrigger
            value="dados"
            className="rounded-xl font-bold text-xs py-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-background data-[state=active]:text-primary transition-all cursor-pointer"
          >
            <User className="h-4 w-4 shrink-0" />
            <span>Dados Pessoais</span>
          </TabsTrigger>
          <TabsTrigger
            value="bioimpedancia"
            className="rounded-xl font-bold text-xs py-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-background data-[state=active]:text-primary transition-all cursor-pointer"
          >
            <Scale className="h-4 w-4 shrink-0" />
            <span>Bioimpedância</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab A: Dados Pessoais */}
        <TabsContent value="dados" className="space-y-6 focus-visible:outline-none">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Input Form Card */}
            <Card className="p-5 rounded-3xl border-border/70 space-y-4">
              <h3 className="font-display font-bold text-base text-foreground flex items-center gap-1.5">
                <User className="h-4 w-4 text-primary" />
                Dados Pessoais
              </h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nome</label>
                  <Input
                    placeholder="Seu nome"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="rounded-xl border-border/80 focus-visible:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Sexo Biológico</label>
                  <Select value={sex} onValueChange={(val: "male" | "female") => setSex(val)}>
                    <SelectTrigger className="rounded-xl border-border/80 text-foreground">
                      <SelectValue placeholder="Selecione o sexo" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="male">Masculino</SelectItem>
                      <SelectItem value="female">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Altura (cm)</label>
                  <Input
                    type="number"
                    placeholder="Ex: 175"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Data de Nascimento</label>
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                  />
                </div>
              </div>

              <Button
                onClick={saveProfile}
                disabled={isSavingProfile}
                className="w-full rounded-full font-semibold mt-2 shadow-sm"
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Perfil"
                )}
              </Button>
            </Card>

            {/* Calculations & Metabolism Card */}
            <div className="space-y-4">
              {/* TMB Card */}
              <Card className="p-5 rounded-3xl border-border/70 bg-gradient-to-br from-primary/5 via-card to-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground">
                      Taxa Metabólica Basal (TMB)
                    </h4>
                    <span className="text-[10px] bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-bold">
                      MSJ Formula
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Calorias mínimas que seu corpo gasta para sobreviver em repouso absoluto.
                  </p>
                </div>

                <div className="my-5">
                  {latestWeight === null ? (
                    <div className="text-center p-3 border border-dashed rounded-2xl bg-amber-500/5 border-amber-500/20">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Nenhum peso registrado
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Para calcular a TMB precisamos do seu peso.
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => navigate({ to: "/app/peso" })}
                        className="text-xs text-primary font-bold h-auto p-0 mt-1"
                      >
                        Registrar peso agora
                      </Button>
                    </div>
                  ) : !sex || !heightCm || !birthDate ? (
                    <div className="text-center p-3 border border-dashed rounded-2xl bg-amber-500/5 border-amber-500/20">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Dados de perfil incompletos
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Preencha sexo, altura e data de nascimento ao lado.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-3xl font-display font-black tracking-tight text-foreground">
                        {localBmr ?? serverBmr ?? "—"}
                        <span className="text-xs font-semibold text-muted-foreground ml-1">kcal/dia</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                        Baseado no último peso de {latestWeight} kg
                      </p>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-muted-foreground/80 flex items-start gap-1 bg-secondary/30 p-2.5 rounded-xl border border-border/50">
                  <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                  <p>
                    Fórmula baseada na idade (
                    {birthDate ? `${calculateAge(birthDate)} anos` : "—"}), altura (
                    {heightCm ? `${heightCm} cm` : "—"}) e peso atual.
                  </p>
                </div>
              </Card>

              {/* TDEE Card */}
              <Card className="p-5 rounded-3xl border-border/70 bg-gradient-to-br from-emerald-500/5 via-card to-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground">
                      Gasto Energético Total (TDEE)
                    </h4>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-bold">
                      Nível de Atividade
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Calorias gastas no dia somando atividades físicas e treinos.
                  </p>
                </div>

                <div className="my-5">
                  {latestWeight === null || !sex || !heightCm || !birthDate ? (
                    <div className="text-center p-3 text-xs text-muted-foreground">
                      Preencha o perfil e o peso primeiro.
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-3xl font-display font-black tracking-tight text-foreground">
                        {localTdee ?? serverTdee ?? "—"}
                        <span className="text-xs font-semibold text-muted-foreground ml-1">kcal/dia</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center justify-center gap-1 font-semibold">
                        <Zap className="h-3 w-3 text-amber-500 fill-amber-500" />
                        Fator de atividade: {activityFactor ? activityFactor.toFixed(3) : "1.200"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-muted-foreground/80 flex items-start gap-1 bg-secondary/30 p-2.5 rounded-xl border border-border/50">
                  <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                  <p>
                    Média de <strong>{sessionsPerWeek.toFixed(1)} treinos/semana</strong> nas últimas 4 semanas de workout_sessions. Fator estimado automaticamente.
                  </p>
                </div>
              </Card>
            </div>
          </div>

          {/* Complete AI Diagnosis Card */}
          <Card className="overflow-hidden border border-primary/15 bg-gradient-to-br from-primary/5 via-primary/[0.01] to-background relative p-5 rounded-3xl shadow-sm">
            <div className="absolute top-0 right-0 h-40 w-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-display font-extrabold text-foreground text-sm">
                  Diagnóstico Consolidado com IA
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cruza perfil pessoal, bioimpedância, metabolismo (TDEE/TMB), histórico de treinos de 30 dias, nutrição (últimos 7 dias) e circunferências para criar um diagnóstico físico evolutivo altamente estruturado.
                </p>

                <div className="pt-4">
                  <Button
                    onClick={runFullAiDiagnosis}
                    disabled={isAnalyzing}
                    className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 text-xs h-9 flex items-center gap-1.5 shadow-md shadow-primary/10 transition-all hover:scale-[1.01]"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Consolidando dados e gerando diagnóstico...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        {aiAnalysis ? "Recalcular Diagnóstico" : "Gerar Diagnóstico Avançado com IA"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* AI Diagnosis Result */}
          {aiAnalysis && (
            <Card className="p-5 border border-primary/20 bg-gradient-to-b from-primary/[0.04] to-card relative rounded-3xl shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="absolute top-0 right-0 h-32 w-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center gap-2 mb-4 border-b border-primary/15 pb-3">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                <h4 className="font-display font-black text-foreground tracking-tight text-sm">
                  Diagnóstico Corporal Evolutivo
                </h4>
                <span className="ml-auto text-[9px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  Coach AI Full
                </span>
              </div>
              <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 font-medium prose dark:prose-invert">
                {aiAnalysis}
              </div>
              <div className="mt-4 border-t border-muted/50 pt-3 text-[10px] text-muted-foreground flex items-center justify-between font-mono">
                <span>FitWell Hub AI Coach Engine</span>
                <span>Análise de dados multipilares</span>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Tab B: Bioimpedância */}
        <TabsContent value="bioimpedancia" className="space-y-6 focus-visible:outline-none">
          {/* Main action and dialog creator */}
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-foreground pl-1">
              Histórico de Composição Corporal
            </h3>

            <Dialog open={isAddingBio} onOpenChange={setIsAddingBio}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
                  <Plus className="h-4 w-4 mr-1.5 stroke-[2.5]" />
                  Adicionar Bioimpedância
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl max-h-[85vh] overflow-y-auto max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-display font-bold text-base">
                    Nova Leitura de Bioimpedância
                  </DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-2 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs font-semibold h-9 px-4 gap-1.5 border-dashed flex-1 sm:flex-none"
                    disabled={isScanningBio}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) scanBioPhoto(file);
                      };
                      input.click();
                    }}
                  >
                    {isScanningBio ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {isScanningBio ? "Escaneando..." : "Escanear exame com IA"}
                  </Button>
                </div>
                <div className="grid gap-3 py-2 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">Data da medição</label>
                    <Input
                      type="date"
                      value={bioDate}
                      onChange={(e) => setBioDate(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Peso (kg)</label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 75.2"
                      value={bioWeight}
                      onChange={(e) => setBioWeight(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Gordura Corporal (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 18.5"
                      value={bioFat}
                      onChange={(e) => setBioFat(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Massa Muscular (kg)</label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 58.4"
                      value={bioMuscle}
                      onChange={(e) => setBioMuscle(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Massa Óssea (kg)</label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 3.2"
                      value={bioBone}
                      onChange={(e) => setBioBone(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Água Corporal (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 55.8"
                      value={bioWater}
                      onChange={(e) => setBioWater(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Gordura Visceral</label>
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="Ex: 5.0"
                      value={bioVisceral}
                      onChange={(e) => setBioVisceral(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">TMB Máquina (kcal)</label>
                    <Input
                      type="number"
                      placeholder="Ex: 1680"
                      value={bioBmr}
                      onChange={(e) => setBioBmr(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Idade Metabólica</label>
                    <Input
                      type="number"
                      placeholder="Ex: 28"
                      value={bioAge}
                      onChange={(e) => setBioAge(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">Anotações / Notas</label>
                    <Input
                      placeholder="Ex: Pós feriado, balança de casa, etc..."
                      value={bioNotes}
                      onChange={(e) => setBioNotes(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button
                    onClick={saveBioimpedance}
                    disabled={isSavingBio}
                    className="rounded-full w-full sm:w-auto font-semibold px-6 shadow-sm"
                  >
                    {isSavingBio ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        Registrando...
                      </>
                    ) : (
                      "Registrar Bio"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {bioLogs.length === 0 ? (
            <Card className="p-12 text-center rounded-3xl border-dashed">
              <Scale className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
              <h3 className="font-display font-bold text-lg text-foreground mb-1">
                Nenhuma bioimpedância registrada
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                Monitore o percentual de gordura, gordura visceral e massa muscular ao longo do tempo com relatórios detalhados.
              </p>
            </Card>
          ) : (
            <>
              {/* Recharts Chart Card */}
              {chartData.length >= 2 ? (
                <Card className="p-5 rounded-3xl border-border/70 shadow-sm bg-card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground">
                        Evolução Histórica
                      </p>
                      <h4 className="font-display font-black text-base text-foreground mt-0.5">
                        Gordura vs Massa Muscular
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full">
                      {chartData.length} leituras
                    </span>
                  </div>
                  <div className="h-64 w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                        <XAxis
                          dataKey="date"
                          fontSize={9}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={false}
                          dy={8}
                        />
                        <YAxis
                          fontSize={9}
                          fontWeight={600}
                          domain={["auto", "auto"]}
                          tickLine={false}
                          axisLine={false}
                          dx={-4}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "16px",
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--card))",
                            fontSize: "12px",
                            fontWeight: 600,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", fontWeight: 700 }} />
                        <Line
                          type="monotone"
                          name="Gordura (%)"
                          dataKey="fat"
                          stroke="hsl(var(--destructive))"
                          strokeWidth={2.5}
                          dot={{ r: 4, stroke: "hsl(var(--background))", strokeWidth: 1.5, fill: "hsl(var(--destructive))" }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                        <Line
                          type="monotone"
                          name="Músculo (kg)"
                          dataKey="muscle"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          dot={{ r: 4, stroke: "hsl(var(--background))", strokeWidth: 1.5, fill: "hsl(var(--primary))" }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : (
                <Card className="p-8 text-center rounded-3xl border-dashed">
                  <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2.5" />
                  <p className="text-sm font-semibold text-muted-foreground mb-1">
                    Múltiplos registros necessários para gráfico
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Registre pelo menos duas bioimpedâncias em datas diferentes para habilitar o gráfico evolutivo.
                  </p>
                </Card>
              )}

              {/* Bioimpedance chronological list */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground pl-1">
                  Registros Anteriores (Toque para Diagnóstico IA)
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[...bioLogs]
                    .reverse()
                    .map((log) => {
                      const formattedDate = new Date(log.log_date + "T00:00").toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      });

                      return (
                        <Card
                          key={log.id}
                          className="p-4 bg-card border-border/60 hover:border-primary/40 hover:bg-secondary/10 transition-all rounded-2xl flex flex-col justify-between group relative overflow-hidden cursor-pointer"
                          onClick={() => runBioLogAiAnalysis(log)}
                        >
                          <div className="absolute top-0 right-0 h-16 w-16 bg-primary/[0.02] rounded-full blur-xl" />
                          <div className="flex items-center justify-between border-b border-muted/50 pb-2 mb-3">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-bold text-foreground truncate max-w-[150px]">
                                {formattedDate}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full hover:bg-destructive/15 hover:text-destructive text-muted-foreground/80 h-7 w-7 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBioLog(log.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-[10px] uppercase font-bold text-muted-foreground">Peso</p>
                              <p className="font-extrabold text-foreground text-sm font-mono mt-0.5">
                                {log.weight_kg ? `${log.weight_kg.toFixed(1)} kg` : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-muted-foreground">% Gordura</p>
                              <p className="font-extrabold text-destructive text-sm font-mono mt-0.5">
                                {log.body_fat_pct ? `${log.body_fat_pct.toFixed(1)}%` : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-muted-foreground">Músculo</p>
                              <p className="font-extrabold text-primary text-sm font-mono mt-0.5">
                                {log.muscle_mass_kg ? `${log.muscle_mass_kg.toFixed(1)} kg` : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-muted-foreground">G. Visceral</p>
                              <p className="font-extrabold text-foreground text-sm font-mono mt-0.5">
                                {log.visceral_fat ? log.visceral_fat : "—"}
                              </p>
                            </div>
                          </div>

                          {log.notes && (
                            <p className="text-[10px] text-muted-foreground italic mt-3 border-t border-muted/35 pt-2 truncate">
                              "{log.notes}"
                            </p>
                          )}
                        </Card>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Specific Bioimpedance Log AI Analysis Dialog */}
      <Dialog
        open={selectedBioLog !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedBioLog(null);
        }}
      >
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-base flex items-center gap-1.5">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
              Análise IA da Medição
            </DialogTitle>
          </DialogHeader>
          {selectedBioLog && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-1.5 text-xs bg-secondary/50 p-2.5 rounded-xl border">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-muted-foreground">
                  Leitura de {new Date(selectedBioLog.log_date + "T00:00").toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              {isAnalyzingBioLog ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs font-semibold">Analisando composição corporal...</p>
                </div>
              ) : bioLogAnalysis ? (
                <div className="space-y-3">
                  <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 font-medium bg-gradient-to-b from-primary/[0.02] to-transparent p-3.5 rounded-2xl border border-primary/10">
                    {bioLogAnalysis}
                  </div>
                  <div className="flex gap-2.5 text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground bg-secondary/30 p-2 rounded-xl">
                    <span>Peso: {selectedBioLog.weight_kg ?? "—"} kg</span>
                    <span>Gordura: {selectedBioLog.body_fat_pct ?? "—"}%</span>
                    <span>Músculo: {selectedBioLog.muscle_mass_kg ?? "—"} kg</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Nenhum relatório gerado.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setSelectedBioLog(null)}
              className="rounded-full w-full font-semibold shadow-sm"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
