import { DEMO_EMAIL } from "../src/lib/demo-account.ts";
import { seedAccount } from "../src/server/local/seed.ts";

console.log(
  seedAccount()
    ? `Datos iniciales cargados para ${DEMO_EMAIL}.`
    : "La cuenta de demostración ya existe. Se conservaron los registros.",
);
