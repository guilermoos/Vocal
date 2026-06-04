export const SUPABASE_URL = "https://xauibfjzjmyjsfinfjbo.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhdWliZmp6am15anNmaW5mamJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Mjg0MTEsImV4cCI6MjA5NjEwNDQxMX0.j6Lvxc_6g0nv5LGZu7Wf5nTp6Ns7C9JSU78sZo0h6dc";

// Inicializa o cliente do Supabase utilizando a biblioteca carregada via CDN global
export const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
