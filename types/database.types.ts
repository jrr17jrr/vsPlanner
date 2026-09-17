/**
 * Tipos do banco real (Supabase/Postgres) — Fase 1 (fundação).
 *
 * Espelham exatamente `supabase/migrations/001_initial_auth_spaces.sql`.
 * Ainda NÃO são usados pelo app (que continua rodando sobre
 * `mock/seed.ts` + `store/db-store.ts`). Isso é código preparado para a
 * Fase 2, quando o login mock for substituído pelo Supabase Auth.
 *
 * Não confundir com `types/entities.ts` (modelos do mock, em português —
 * `role`, `status: 'ativo'|'bloqueado'` etc.). Os nomes de campo aqui
 * seguem a migration real (`system_role`, `status: 'active'|'blocked'`,
 * snake_case). A camada que migrar cada módulo do mock para o Supabase
 * (Fase 2+) é responsável por fazer esse mapeamento — não fizemos esse
 * mapeamento ainda de propósito.
 */

export type SystemRole = "super_admin" | "user";
export type ProfileStatus = "active" | "blocked";
export type SpaceType = "personal" | "business" | "tiktok" | "other";
export type SpaceRole = "owner" | "admin" | "member" | "viewer";

export interface Profile {
  id: string; // uuid, = auth.users.id
  name: string;
  avatar_url: string | null;
  phone: string | null;
  system_role: SystemRole;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface Space {
  id: string; // uuid
  name: string;
  slug: string;
  type: SpaceType;
  owner_id: string; // uuid, references profiles.id
  created_at: string;
  updated_at: string;
}

export interface SpaceMember {
  id: string; // uuid
  space_id: string;
  user_id: string;
  role: SpaceRole;
  created_at: string;
}

/**
 * Formato mínimo esperado pelo `@supabase/ssr` / `@supabase/supabase-js`
 * para tipar `createClient<Database>()`. Cobre só as tabelas da Fase 1 —
 * cresce conforme novos módulos forem migrados do mock.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; name: string };
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [];
      };
      spaces: {
        Row: Space;
        Insert: Partial<Space> & { name: string; slug: string; type: SpaceType; owner_id: string };
        Update: Partial<Omit<Space, "id">>;
        Relationships: [];
      };
      space_members: {
        Row: SpaceMember;
        Insert: Partial<SpaceMember> & { space_id: string; user_id: string; role: SpaceRole };
        Update: Partial<Omit<SpaceMember, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
