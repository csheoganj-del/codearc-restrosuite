// ==========================================
// Configuration File for CodeArc RestoSuite Configuration
// Centralized config to avoid hardcoding
// ==========================================

const CONFIG = {
  supabase: {
    url: window.ENV_SUPABASE_URL || 'https://htkauiibuejetimfiavs.supabase.co',
    anonKey: window.ENV_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk'
  },
  functions: {
    tenantAccess: 'https://htkauiibuejetimfiavs.supabase.co/functions/v1/tenant-access',
    tenantPublic: 'https://htkauiibuejetimfiavs.supabase.co/functions/v1/tenant-public',
  }
};
