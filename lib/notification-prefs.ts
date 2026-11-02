import { normalizeReminderOffsets, type ReminderOffset } from "@/lib/task-schedule";

/**
 * Preferências de notificação (profiles.notification_preferences, jsonb —
 * sem migration). Chaves antigas (tasks/routine/meetings/finance/clt) são
 * preservadas; as novas têm default ligado, então quem nunca mexeu continua
 * recebendo o que já recebia.
 */
export type NotificationPrefs = {
  /** Interruptor geral. */
  enabled: boolean;
  tasks: boolean;
  routine: boolean;
  meetings: boolean;
  finance: boolean;
  clt: boolean;
  /** Lembretes de execução (no horário / antes). */
  execution: boolean;
  /** Prazo próximo (véspera) e prazo no dia. */
  deadline: boolean;
  /** Alertas de atraso. */
  overdue: boolean;
  /** Horário dos avisos de prazo/atraso (HH:MM, São Paulo). */
  digestTime: string;
  /** Antecedência usada quando a tarefa tem horário mas nenhum lembrete escolhido. */
  defaultOffsets: ReminderOffset[];
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  tasks: true,
  routine: true,
  meetings: true,
  finance: true,
  clt: true,
  execution: true,
  deadline: true,
  overdue: true,
  digestTime: "09:00",
  defaultOffsets: [0],
};

export const DIGEST_TIMES = ["07:00", "08:00", "09:00", "10:00", "12:00", "18:00", "20:00"] as const;

const BOOL_KEYS = ["enabled", "tasks", "routine", "meetings", "finance", "clt", "execution", "deadline", "overdue"] as const;

export function resolveNotificationPrefs(raw: unknown): NotificationPrefs {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of BOOL_KEYS) if (typeof src[key] === "boolean") out[key] = src[key] as boolean;
  if (typeof src.digestTime === "string" && /^\d{2}:\d{2}$/.test(src.digestTime)) out.digestTime = src.digestTime;
  if (Array.isArray(src.defaultOffsets)) out.defaultOffsets = normalizeReminderOffsets(src.defaultOffsets);
  return out;
}

/** Valida o que vem da tela antes de gravar (nunca grava chave desconhecida). */
export function validateNotificationPrefs(input: unknown): { error: string } | { value: NotificationPrefs } {
  if (!input || typeof input !== "object") return { error: "Preferências inválidas." };
  const src = input as Record<string, unknown>;
  for (const key of BOOL_KEYS) if (key in src && typeof src[key] !== "boolean") return { error: "Preferências inválidas." };
  if ("digestTime" in src && (typeof src.digestTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(src.digestTime))) return { error: "Horário inválido." };
  return { value: resolveNotificationPrefs(src) };
}
