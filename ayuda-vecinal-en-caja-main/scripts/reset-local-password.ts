import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { resetLocalPassword } from "../src/server/local/auth.ts";

const address = process.argv[2];
if (!address || !process.stdin.isTTY) {
  console.error("Ejecuta npm run db:password -- tu-correo en una terminal interactiva.");
  process.exit(1);
}

const output = new Writable({
  write(_chunk, _encoding, done) {
    done();
  },
});
const input = createInterface({ input: process.stdin, output, terminal: true });
try {
  process.stdout.write("Nueva contraseña (8 a 72 caracteres): ");
  const secret = await input.question("");
  process.stdout.write("\nRepite la contraseña: ");
  const confirmation = await input.question("");
  if (secret !== confirmation) throw new Error("Las contraseñas no coinciden.");
  resetLocalPassword(address, secret);
  console.log("\nContraseña actualizada. Las sesiones previas se cerraron.");
} catch (error) {
  console.error(
    "\n" + (error instanceof Error ? error.message : "No se pudo actualizar la contraseña."),
  );
  process.exitCode = 1;
} finally {
  input.close();
}
