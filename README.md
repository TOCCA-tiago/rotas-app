# TOCCA Rotas

Busca as notas fiscais de saída emitidas no **Tiny** (API v2), localiza os endereços no mapa e monta a
**rota de entrega** entre as notas selecionadas. Domínio: `rotas.tocca.com.br`.

Mesma base do CRM: Next.js 14 + Tailwind + Supabase + Vercel. Usa **o mesmo projeto Supabase do CRM**
(login com os mesmos usuários, só perfis ativos entram) e **o mesmo token do Tiny**.

## Colocar no ar (uma vez)

1. **Supabase (projeto do CRM)** → SQL Editor → rode `supabase/rotas_geocache.sql`.
   Cria só a tabela `rotas_geocache` (cache de endereços localizados); não mexe em nada do CRM.
   Depois rode também `supabase/rotas_salvas.sql` (rotas salvas).
2. **Vercel** → Add New Project → importe este repositório → em Environment Variables:

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | igual ao do CRM |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | igual ao do CRM |
   | `TINY_API_TOKEN` | igual ao do CRM |
   | `GOOGLE_MAPS_API_KEY` | opcional, recomendado: chave restrita à Geocoding API (localização precisa) |
   | `ORIGEM_ENDERECO` | endereço de saída das entregas, ex.: `Rua X, 123, Bairro, Cidade - UF, 00000-000` |

3. **Domínio**: em Settings → Domains da Vercel, adicione `rotas.tocca.com.br` e crie o CNAME
   `rotas` → `cname.vercel-dns.com` no DNS do domínio.
4. **Supabase** → Authentication → URL Configuration → adicione `https://rotas.tocca.com.br/**`
   em Redirect URLs.

## Uso

1. Escolha o período e clique em **Buscar notas**.
2. Marque as notas que vão sair para entrega.
3. Clique em **Montar rota**: o app localiza os endereços, otimiza a ordem e desenha o trajeto.
4. Se um pino ficar no lugar errado, **arraste-o**. A correção fica salva para todos.
5. Troque a ordem com ↑ ↓, o seletor de posição, arrastando a linha ou com **Inverter sentido**.
6. **Salvar rota** (nome + data da entrega). As rotas ficam na aba **Rotas salvas**, visíveis para toda a equipe.
7. **Abrir no Google Maps** (no celular vira navegação), **Exportar CSV** ou **Imprimir romaneio**.

## Como funciona

| Parte | Serviço |
|---|---|
| Notas | `notas.fiscais.pesquisa` (tipo S), uma página por chamada; `nota.fiscal.obter` se faltar endereço. Ignora canceladas, rejeitadas e denegadas |
| Endereço | Endereço de entrega da nota; se não houver, o do cliente |
| Mapa | Google Geocoding (se houver `GOOGLE_MAPS_API_KEY`); senão Nominatim/OpenStreetMap e BrasilAPI (CEP). Cache em `rotas_geocache`; pino arrastado à mão tem prioridade |
| Google Maps | O link leva o endereço escrito (sem complemento); pinos ajustados à mão vão como coordenada |
| Rota | OSRM (`trip` otimiza a ordem; `route` segue a ordem de marcação) |

## Limitações conhecidas

- Nominatim e o OSRM público são gratuitos e sem garantia de disponibilidade. Para volume maior, trocar por
  Google Maps/Mapbox ou um OSRM próprio (`OSRM_URL`).
- A precisão de cada endereço aparece na lista (`aprox. rua`, `aprox. CEP`, `só cidade`). Confira antes de sair.
- Cada link do Google Maps aceita até 11 pontos; rotas maiores saem em partes.

## Desenvolvimento

```bash
cp .env.example .env.local   # preencha
npm install
npm run dev
```
