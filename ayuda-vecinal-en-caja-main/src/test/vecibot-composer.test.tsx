import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptInput, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
afterEach(cleanup);
describe("conservación del mensaje al enviar", () => {
  it("mantiene la transcripción cuando no existe un proveedor de IA", async () => {
    const submit = vi.fn().mockResolvedValue(false);
    render(<PromptInput onSubmit={submit}><PromptInputTextarea aria-label="Consulta" defaultValue="Mi consulta sin IA" /><button type="submit">Enviar</button></PromptInput>);
    fireEvent.click(screen.getByText("Enviar"));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Consulta")).toHaveValue("Mi consulta sin IA");
    expect(submit.mock.calls[0]![0]).toMatchObject({ text: "Mi consulta sin IA", files: [] });
  });
  it("no borra una consulta nueva escrita mientras terminaba el envío anterior", async () => {
    let finish!: () => void;
    const submit = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<PromptInput onSubmit={submit}><PromptInputTextarea aria-label="Consulta" defaultValue="Consulta anterior" /><button type="submit">Enviar</button></PromptInput>);
    fireEvent.click(screen.getByText("Enviar"));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "Consulta nueva" } });
    finish();
    await waitFor(() => expect(screen.getByLabelText("Consulta")).toHaveValue("Consulta nueva"));
  });
});
