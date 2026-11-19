import { useState, type FormEvent } from "react";
import { cents, uid, type Account, type ManualInvoice } from "../domain";

type Props = {
  cards: Account[];
  month: string;
  cardId?: string;
  invoice?: ManualInvoice;
  onSave: (invoice: ManualInvoice, repeat: boolean) => Promise<boolean>;
  onCancel: () => void;
  onError: (message: string) => void;
};

function dueDate(month: string, day: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(
    Date.UTC(
      year,
      value,
      Math.min(day, new Date(Date.UTC(year, value + 1, 0)).getUTCDate()),
    ),
  );
  return date.toISOString().slice(0, 10);
}

export function InvoiceForm({
  cards,
  month,
  cardId,
  invoice,
  onSave,
  onCancel,
  onError,
}: Props) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const competence = String(values.get("competence") ?? "");
      const next: ManualInvoice = {
        id: invoice?.id ?? uid(),
        cardId: String(values.get("cardId") ?? ""),
        competence,
        total: cents(String(values.get("total") ?? "")),
        dueDate: String(values.get("dueDate") ?? ""),
        recurrenceId: invoice?.recurrenceId ?? null,
      };
      if (!next.total) throw new Error("Informe um total maior que zero.");
      const repeat = !invoice && values.get("repeat") === "on";
      if (await onSave(next, repeat)) onCancel();
    } catch (error) {
      onError((error as Error).message);
    }
  }
  const firstCard =
    cards.find((card) => card.id === (invoice?.cardId ?? cardId)) ?? cards[0];
  const [selectedCardId, setSelectedCardId] = useState(
    invoice?.cardId ?? cardId ?? firstCard?.id ?? "",
  );
  const [dueDateValue, setDueDateValue] = useState(
    invoice?.dueDate ?? dueDate(month, firstCard?.due ?? 15),
  );
  if (!cards.length) {
    return (
      <section className="panel modal-panel">
        <div className="section-title">
          <h2>Nova fatura</h2>
          <button className="ghost" type="button" onClick={onCancel}>
            Fechar
          </button>
        </div>
        <p className="empty">
          Cadastre um cartão antes de registrar uma fatura.
        </p>
      </section>
    );
  }
  return (
    <section className="panel modal-panel">
      <div className="section-title">
        <div>
          <h2>{invoice ? "Editar fatura" : "Nova fatura"}</h2>
          <p className="muted">
            Informe o total da fatura. Não precisa lançar cada compra.
          </p>
        </div>
        <button className="ghost" type="button" onClick={onCancel}>
          Fechar
        </button>
      </div>
      <form
        className="grid-form"
        onSubmit={(event) => void submit(event)}
        key={invoice?.id ?? "new-invoice"}
      >
        <label>
          Cartão
          <select
            name="cardId"
            required
            value={selectedCardId}
            disabled={!!invoice}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedCardId(nextId);
              const selectedCard = cards.find((card) => card.id === nextId);
              if (selectedCard)
                setDueDateValue(dueDate(month, selectedCard.due));
            }}
          >
            <option value="" disabled>
              Selecione
            </option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mês de referência
          <input
            name="competence"
            type="month"
            required
            defaultValue={invoice?.competence ?? month}
            readOnly={!!invoice}
          />
        </label>
        <label>
          Valor total (R$)
          <input
            name="total"
            type="number"
            min=".01"
            step=".01"
            required
            defaultValue={invoice ? invoice.total / 100 : undefined}
          />
        </label>
        <label>
          Vencimento
          <input
            name="dueDate"
            type="date"
            required
            value={dueDateValue}
            onChange={(event) => setDueDateValue(event.target.value)}
          />
        </label>
        {!invoice && (
          <label className="check-label">
            <input name="repeat" type="checkbox" /> Repetir este valor nos
            próximos meses
          </label>
        )}
        {invoice?.recurrenceId && (
          <p className="muted">
            A alteração vale somente para esta competência. Os próximos meses
            mantêm o valor previsto.
          </p>
        )}
        <div className="form-actions">
          <button>{invoice ? "Salvar esta fatura" : "Salvar fatura"}</button>
        </div>
      </form>
    </section>
  );
}
