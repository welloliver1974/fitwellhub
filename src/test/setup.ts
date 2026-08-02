// Setup dos testes Vitest: carrega os matchers do jest-dom (toBeInTheDocument,
// toHaveTextContent, etc.) e limpa a DOM entre os testes de UI.
// Mantém o import explícito de describe/it/expect do vitest em cada teste
// (sem globals) — convenção já usada pelos testes de src/lib. Sem globals,
// o auto-cleanup do testing-library não dispara sozinho, então registramos
// cleanup no afterEach aqui.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
