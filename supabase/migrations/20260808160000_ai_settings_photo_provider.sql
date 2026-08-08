-- Foto do prato: provedor e modelo de visao dedicados, independentes do
-- provedor/modelo de texto do Coach.
-- NULL = comportamento atual (auto: nvidia/omniroute/openrouter + qwen2.5-vl).
alter table public.ai_settings
  add column photo_provider text,
  add column photo_model text;
