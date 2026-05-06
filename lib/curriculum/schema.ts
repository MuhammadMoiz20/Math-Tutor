import { z } from "zod";
import YAML from "yaml";

export const ModuleSource = z.object({
  book: z.string(),
  chapters: z.array(z.number().int()),
  primary: z.boolean().optional(),
  role: z.string().optional(),
});

export const Module = z.object({
  id: z.string(),
  title: z.string(),
  ord: z.number().int(),
  sources: z.array(ModuleSource).default([]),
});

export const Curriculum = z.object({
  modules: z.array(Module),
});

export type ModuleSource = z.infer<typeof ModuleSource>;
export type Module = z.infer<typeof Module>;
export type Curriculum = z.infer<typeof Curriculum>;

export function parseCurriculumYaml(yamlText: string): Curriculum {
  const raw = YAML.parse(yamlText);
  return Curriculum.parse(raw);
}
