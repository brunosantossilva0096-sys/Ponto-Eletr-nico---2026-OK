export interface Company {
  id: string;
  name: string;
  cnpj: string;
  created_at?: string;
}

export interface Employee {
  id: string;
  name: string;
  cpf: string;
  pis: string;
  role: string;
  pin: string | null;
  id_funcionario: string;
  allowed_lat: number | null;
  allowed_lng: number | null;
  allowed_radius: number;
  company_id?: string;
  companies?: Company; // Para queries com JOIN
  
  // RH Fields
  work_start?: string | null;
  break_start?: string | null;
  break_end?: string | null;
  work_end?: string | null;
  work_days?: number[]; // [0,1,2,3,4,5,6] onde 0 = Domingo
  auth_method?: 'both' | 'digital' | 'pin';
}

export interface TimeLog {
  id: string;
  timestamp: string;
  type: string;
  distance: number | null;
  latitude: number | null;
  longitude: number | null;
  verification_method: string;
  photo_evidence: string | null;
  hash_assinatura: string;
  pis_pasep_trabalhador: string;
  cpf_trabalhador: string | null;
  cnpj_empregador: string | null;
  razao_social_empregador: string | null;
  created_at: string;
  employee_id: string;
  employees?: Employee; // Adicionado para relatórios
  
  // Auditoria
  is_edited?: boolean;
  original_timestamp?: string | null;
  edit_reason?: string | null;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  type: string;
  created_at?: string;
}

export interface Absence {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  approved_by: string | null;
  document_url: string | null;
  created_at?: string;
  employees?: Employee;
}
