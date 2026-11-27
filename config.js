// =====================================================================
//  CONFIGURAÇÃO DA LOJA — edite os 4 valores abaixo
// =====================================================================
export const CONFIG = {
  // Nome que aparece no site
  storeName: 'Pocket Boutique TCG',

  // SEU WhatsApp que recebe os pedidos: código do país + DDD + número, só dígitos
  storeWhatsapp: '5511911718301',

  // Supabase → Project Settings → Data API → Project URL
  supabaseUrl: 'https://gwigbteuyuaucjabajrk.supabase.co/rest/v1/',

  // Supabase → Project Settings → API Keys → Publishable key (sb_publishable_...)
  // Esta chave é PÚBLICA por natureza; quem protege os dados são as regras do setup.sql.
  // NUNCA coloque aqui a "secret key" / "service_role".
  supabaseKey: 'sb_publishable_Tv0RVcqHo6W7mEoaMSAPuw_W2jvV7Lr',
};
