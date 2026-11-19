import { useState, type FormEvent } from "react";
import {
  cents,
  today,
  uid,
  type Account,
  type Category,
  type ExpenseRecurrence,
  type Frequency,
} from "../domain";

type Props = {
  accounts: Account[];
  categories: Category[];
  recurrence?: ExpenseRecurrence;
  onSave: (recurrence: ExpenseRecurrence) => Promise<boolean>;
  onCancel: () => void;
  onError: (message: string) => void;
};

export function RecurrenceForm({
  accounts,
  categories,
  recurrence,
  onSave,
  onCancel,
  onError,
}: Props) {
  const [untilCancelled, setUntilCancelled] = useState(!recurrence?.endDate);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const repeatUntilCancelled = values.get("untilCancelled") === "on";
      const next: ExpenseRecurrence = {
        id: recurrence?.id ?? uid(),
        description: String(values.get("description") ?? "").trim(),
        amount: cents(String(values.get("amount") ?? "")),
        category: String(values.get("category") ?? ""),
        account: String(values.get("account") ?? ""),
        startDate: String(values.get("startDate") ?? ""),
        endDate: repeatUntilCancelled
          ? null
          : String(values.get("endDate") ?? ""),
        endedAt: recurrence?.endedAt ?? null,
        frequency: String(values.get("frequency") ?? "monthly") as Frequency,
        status: recurrence?.status ?? "active",
        pauses: recurrence?.pauses ?? [],
        overrides: recurrence?.overrides ?? [],
        settledOccurrences: recurrence?.settledOccurrences ?? [],
        revisions: recurrence?.revisions ?? [],
      };
      if (!next.description || !next.amount)
        throw new Error("Preencha a descrição e um valor maior que zero.");
      if (!repeatUntilCancelled && !next.endDate)
        throw new Error(
          "Informe a data final ou escolha repetir até cancelar.",
        );
      if (next.endDate && next.endDate < next.startDate)
        throw new Error("A data final deve ser posterior à data inicial.");
      if (await onSave(next)) onCancel();
    } catch (error) {
      onError((error as Error).message);
    }
  }
  return (
    <section className="panel modal-panel">
      <div className="section-title">
        <div>
          <h2>
            {recurrence ? "Editar recorrência" : "Nova despesa recorrente"}
          </h2>
          <p className="muted">Cada vencimento começa como previsão.</p>
        </div>
        <button className="ghost" type="button" onClick={onCancel}>
          Fechar
        </button>
      </div>
      <form
        className="grid-form"
        onSubmit={(event) => void submit(event)}
        key={recurrence?.id ?? "new-recurrence"}
      >
        <label>
          Descrição
          <input
            name="description"
            required
            maxLength={120}
            defaultValue={recurrence?.description}
            placeholder="Ex.: Internet"
          />
        </label>
        <label>
          Valor (R$)
          <input
            name="amount"
            type="number"
            min=".01"
            step=".01"
            required
            defaultValue={recurrence ? recurrence.amount / 100 : undefined}
          />
        </label>
        <label>
          Categoria
          <select
            name="category"
            required
            defaultValue={recurrence?.category ?? ""}
          >
            <option value="" disabled>
              Selecione
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Conta ou cartão
          <select
            name="account"
            required
            defaultValue={
              recurrence?.account ??
              accounts.find((account) => account.type !== "card")?.id ??
              ""
            }
          >
            <option value="" disabled>
              Selecione
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.type === "card" ? " · cartão" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Primeiro vencimento
          <input
            name="startDate"
            type="date"
            required
            readOnly={!!recurrence}
            defaultValue={recurrence?.startDate ?? today()}
          />
        </label>
        <label>
          Frequência
          <select
            name="frequency"
            defaultValue={recurrence?.frequency ?? "monthly"}
            disabled={!!recurrence}
          >
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
          {recurrence && (
            <input
              type="hidden"
              name="frequency"
              value={recurrence.frequency}
            />
          )}
        </label>
        {recurrence && (
          <p className="muted">
            Para mudar o vencimento de uma data, edite a ocorrência na lista e
            escolha se a mudança vale para as próximas.
          </p>
        )}
        <label className="check-label">
          <input
            name="untilCancelled"
            type="checkbox"
            checked={untilCancelled}
            onChange={(event) => setUntilCancelled(event.target.checked)}
          />{" "}
          Repetir até cancelar
        </label>
        {!untilCancelled && (
          <label>
            Último vencimento
            <input
              name="endDate"
              type="date"
              required
              defaultValue={recurrence?.endDate ?? ""}
            />
          </label>
        )}
        <div className="form-actions">
          <button>
            {recurrence ? "Salvar recorrência" : "Criar recorrência"}
          </button>
        </div>
      </form>
    </section>
  );
}
