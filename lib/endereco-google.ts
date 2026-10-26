import type { Endereco } from "@/lib/tiny";

// Endereço para o Google Maps localizar sozinho: sem complemento (apto, sala, "recepção com…"),
// que costuma confundir a busca.
export function enderecoGoogle(e: Endereco) {
  const cep = e.cep.length === 8 ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : e.cep;
  return [
    [e.logradouro, e.numero].filter(Boolean).join(", "),
    e.bairro,
    [e.cidade, e.uf].filter(Boolean).join(" - "),
    cep,
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");
}
