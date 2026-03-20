declare const Chart: any;

interface LeadTask {
    desc: string;
    done: boolean;
    createdAt?: number | string | null;
}

interface LeadRecord {
    id: string;
    name: string;
    phone?: string;
    origin?: string;
    value?: number;
    nextStep?: string;
    stage?: string;
    tasks?: LeadTask[];
    lossReason?: string;
    obs?: string;
    owner?: string;
    tags?: string[];
    createdAt?: number | string | null;
    updatedAt?: number | string | null;
    deleted?: boolean;
    lastModifiedBy?: string;
}

interface SessionRecord {
    user: string;
    role: 'admin' | 'consultor' | 'leitura';
    token: string;
    exp: number;
}

interface UserRecord {
    user: string;
    role: 'admin' | 'consultor' | 'leitura';
    createdAt?: string | number;
}

interface ApiError extends Error {
    code?: string;
}

interface Window {
    XLSX?: any;
}

declare function isAdmin(): boolean;
declare function canWrite(): boolean;
declare function handleApiFailure(err: ApiError | unknown, msg?: string): boolean;
declare function setUsersAdminUiState(): void;
