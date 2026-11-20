import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  balance,
  cents,
  expenseTotalForMonth,
  initial,
  invoices,
  invoiceForecasts,
  money,
  nextUnsettledOccurrence,
  occurrenceForMonth,
  reviseOccurrence,
  schedule,
  setRecurrenceStatus,
  settleOccurrence,
  today,
  uid,
  type Account,
  type Data,
  type Entry,
  type ExpenseOccurrence,
  type ExpenseRecurrence,
  type Group,
  type InvoiceRecurrence,
  type InvoiceView,
  type ManualInvoice,
} from "./domain";
import {
  AccountsSection,
  InvoicesSection,
  MovementsSection,
  PlanningSection,
  RecurringForecastSection,
  SettingsSection,
} from "./components/FinanceSections";
import { AccountForm } from "./components/AccountForm";
import { EntryForm } from "./components/EntryForm";
import { RecurrenceForm } from "./components/RecurrenceForm";

type Modal =
  | "menu"
  | "invoices"
  | "invoice-entry"
  | "expense"
  | "income"
  | "transfer"
  | "bank"
  | "card"
  | "recurrence"
  | "edit-entry"
  | "edit-account"
  | "edit-recurrence"
  | "occurrence";
type Props = {
  data: Data;
  save: (next: Data) => Promise<boolean>;
  busy: boolean;
  message: string;
  setMessage: (message: string) => void;
  shared: boolean;
  storageError: boolean;
  restore: (next: Data) => Promise<boolean>;
  onInvite?: (email: string) => Promise<void>;
  onSignOut?: () => void;
};

const monthNow = () => today().slice(0, 7);
const monthOffset = (month: string, offset: number) => {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
};
const validMonth = (value: string | null) =>
  value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : monthNow();
const dateLabel = (value: string) => value.split("-").reverse().join("/");
const field = (form: FormData, name: string) => String(form.get(name) ?? "");

function Dialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="form-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function FinanceHome({
  data,
  save,
  busy,
  message,
  setMessage,
  shared,
  storageError,
  restore,
  onInvite,
  onSignOut,
}: Props) {
  const [month, setMonth] = useState(() =>
    validMonth(localStorage.getItem("mbfinancas.month.v1")),
  );
  const [modal, setModal] = useState<Modal | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<ManualInvoice | null>(
    null,
  );
  const [returnToInvoices, setReturnToInvoices] = useState(false);
  const [newInvoiceCardId, setNewInvoiceCardId] = useState("");
  const [editingRecurrence, setEditingRecurrence] =
    useState<ExpenseRecurrence | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<{
    occurrence: ExpenseOccurrence;
    recurrence: ExpenseRecurrence;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterAccount, setFilterAccount] = useState("");

  useEffect(() => {
    localStorage.setItem("mbfinancas.month.v1", month);
  }, [month]);

  const monthlyEntries = data.entries.filter((entry) =>
    entry.date.startsWith(month),
  );
  const nextMonth = monthOffset(month, 1);
  const recurrenceOccurrencesForMonth = (targetMonth: string) =>
    data.recurrences
      .flatMap((recurrence) =>
        occurrenceForMonth(recurrence, targetMonth, data).map((occurrence) => ({
          occurrence,
          recurrence,
        })),
      )
      .filter(
        ({ occurrence }) =>
          occurrence.status !== "paid" ||
          data.accounts.find((account) => account.id === occurrence.account)
            ?.type === "card",
      )
      .sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date));
  const currentRecurringOccurrences = recurrenceOccurrencesForMonth(month);
  const nextRecurringOccurrences = recurrenceOccurrencesForMonth(nextMonth);
  const allInvoices = invoices(data);
  const paymentKeysThisMonth = new Set(
    data.entries
      .filter(
        (entry) =>
          entry.type === "transfer" &&
          !!entry.invoice &&
          entry.date.startsWith(month),
      )
      .map((entry) => entry.invoice),
  );
  const invoicesForMonth = allInvoices.filter(
    (invoice) =>
      paymentKeysThisMonth.has(invoice.key) ||
      (invoice.paid < invoice.total && invoice.date.slice(0, 7) <= month),
  );
  const forecastsDueThisMonth = [0, 1, 2]
    .flatMap((offset) => invoiceForecasts(data, monthOffset(month, -offset)))
    .filter((invoice) => invoice.date.slice(0, 7) === month);
  const invoiceBills = [
    ...new Map(
      [...invoicesForMonth, ...forecastsDueThisMonth].map((invoice) => [
        invoice.key,
        invoice,
      ]),
    ).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const bankBalance = data.accounts
    .filter((account) => account.type !== "card")
    .reduce((sum, account) => sum + balance(data, account), 0);
  const monthlyIncome = monthlyEntries
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyExpenses = expenseTotalForMonth(data, month);
  const outstandingInvoices = invoiceBills
    .filter((invoice) => invoice.source !== "forecast")
    .reduce(
      (sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid),
      0,
    );
  const forecastTotal = invoiceBills
    .filter((invoice) => invoice.source === "forecast")
    .reduce((sum, invoice) => sum + invoice.total, 0);

  const pendingInvoiceRows = allInvoices
    .filter(
      (invoice) =>
        invoice.paid === 0 &&
        invoice.date.slice(0, 7) <= month &&
        (invoice.source !== "manual" ||
          !data.manualInvoices.some(
            (record) => record.id === invoice.invoiceId && record.archived,
          )),
    )
    .map((invoice) => ({
      kind: "invoice" as const,
      date: invoice.date,
      invoice,
    }));
  const visibleRows = [
    ...monthlyEntries.map((entry) => ({
      kind: "entry" as const,
      date: entry.date,
      entry,
    })),
    ...pendingInvoiceRows,
  ]
    .filter((row) => {
      const entryDestination =
        row.kind === "entry" && row.entry.type === "transfer"
          ? data.accounts.find(
              (account) => account.id === row.entry.destination,
            )
          : undefined;
      const entryTitle =
        row.kind === "invoice"
          ? `Fatura · ${row.invoice.card.name}`
          : row.kind === "entry" &&
              row.entry.type === "transfer" &&
              row.entry.invoice
            ? `Pagamento da fatura · ${entryDestination?.name ?? "Cartão"}`
            : row.kind === "entry"
              ? row.entry.description
              : "";
      const categoryName =
        row.kind === "entry"
          ? (data.categories.find(
              (category) => category.id === row.entry.category,
            )?.name ?? "")
          : "";
      const text = `${entryTitle} ${categoryName} ${entryDestination?.name ?? ""}`;
      const type = row.kind === "entry" ? row.entry.type : "expense";
      const category = row.kind === "entry" ? row.entry.category : "";
      const matchesAccount =
        row.kind === "entry"
          ? row.entry.account === filterAccount ||
            (row.entry.type === "transfer" &&
              row.entry.destination === filterAccount)
          : row.invoice.card.id === filterAccount;
      return (
        text
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")) &&
        (!filterType || filterType === type) &&
        (!filterCategory || filterCategory === category) &&
        (!filterAccount || matchesAccount)
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  function openAdd() {
    setModal("menu");
    setReturnToInvoices(false);
    setNewInvoiceCardId("");
    setMessage("");
  }
  function choose(kind: Modal) {
    setModal(kind);
    setReturnToInvoices(false);
    setEditingEntry(null);
    setEditingAccount(null);
    setEditingInvoice(null);
    setEditingRecurrence(null);
    setNewInvoiceCardId("");
    setMessage("");
  }
  function closeModal() {
    const returnToInvoiceList = returnToInvoices;
    setReturnToInvoices(false);
    setModal(returnToInvoiceList ? "invoices" : null);
    setEditingEntry(null);
    setEditingAccount(null);
    setEditingInvoice(null);
    setEditingRecurrence(null);
    setSelectedOccurrence(null);
    setNewInvoiceCardId("");
  }

  async function submitEntry(
    event: FormEvent<HTMLFormElement>,
    type: Entry["type"],
    accountId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (
        editingEntry &&
        JSON.stringify(
          data.entries.find((entry) => entry.id === editingEntry.id),
        ) !== JSON.stringify(editingEntry)
      )
        throw new Error(
          "Esta movimentação mudou em outra tela. Feche e abra novamente para editar a versão atual.",
        );
      const account = data.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error("Escolha uma conta para continuar.");
      const amount = cents(field(form, "amount"));
      if (!amount) throw new Error("Informe um valor maior que zero.");
      const date = field(form, "date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today())
        throw new Error("Use uma data válida que já ocorreu.");
      if (type !== "expense" && account.type === "card")
        throw new Error(
          "Receitas e transferências usam conta bancária ou dinheiro.",
        );
      const count =
        type === "expense" && account.type === "card"
          ? Number(field(form, "installments"))
          : 1;
      const entry: Entry = {
        id: editingEntry?.id ?? uid(),
        type,
        amount,
        date,
        account: accountId,
        destination: field(form, "destination"),
        category: type === "expense" ? field(form, "category") : "",
        description: field(form, "description").trim(),
        installments: count,
        invoice: "",
        schedule:
          type === "expense" && account.type === "card"
            ? schedule(amount, count, date, account)
            : [],
        recurrenceId: editingEntry?.recurrenceId,
        occurrenceDate: editingEntry?.occurrenceDate,
      };
      if (
        editingEntry &&
        invoices(data).some(
          (invoice) =>
            invoice.paid > 0 &&
            editingEntry.schedule.some(
              (part) => invoice.key === editingEntry.account + "|" + part.date,
            ),
        )
      )
        throw new Error(
          "Remova primeiro os pagamentos das faturas vinculadas para alterar esta compra.",
        );
      if (
        await save({
          ...data,
          entries: [
            ...data.entries.filter((item) => item.id !== entry.id),
            entry,
          ],
        })
      ) {
        closeModal();
        setMessage("Movimentação salva.");
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function removeEntry(entry: Entry) {
    if (
      invoices(data).some(
        (invoice) =>
          invoice.paid > 0 &&
          entry.schedule.some(
            (part) => invoice.key === entry.account + "|" + part.date,
          ),
      )
    ) {
      setMessage("Exclua primeiro os pagamentos vinculados a essa compra.");
      return;
    }
    if (
      confirm(
        entry.invoice
          ? "Excluir este pagamento? O saldo da fatura e da conta será atualizado."
          : "Excluir esta movimentação?",
      )
    ) {
      const recurrences =
        entry.recurrenceId && entry.occurrenceDate
          ? data.recurrences.map((item) =>
              item.id === entry.recurrenceId
                ? {
                    ...item,
                    settledOccurrences: item.settledOccurrences.filter(
                      (date) => date !== entry.occurrenceDate,
                    ),
                  }
                : item,
            )
          : data.recurrences;
      if (
        await save({
          ...data,
          recurrences,
          entries: data.entries.filter((item) => item.id !== entry.id),
        })
      )
        setMessage("Movimentação excluída.");
    }
  }

  async function saveAccount(account: Account) {
    if (
      data.accounts.some(
        (item) =>
          item.id !== account.id &&
          item.name.trim().toLocaleLowerCase("pt-BR") ===
            account.name.trim().toLocaleLowerCase("pt-BR"),
      )
    ) {
      setMessage("Já existe uma conta ou cartão com esse nome.");
      return false;
    }
    const accounts = editingAccount
      ? data.accounts.map((item) => (item.id === account.id ? account : item))
      : [...data.accounts, account];
    const saved = await save({ ...data, accounts });
    if (saved) {
      closeModal();
      setMessage(editingAccount ? "Conta atualizada." : "Conta cadastrada.");
    }
    return saved;
  }

  async function saveRecurrence(recurrence: ExpenseRecurrence) {
    const current = data.recurrences.find((item) => item.id === recurrence.id);
    let next = recurrence;
    if (current) {
      const pending = nextUnsettledOccurrence(current);
      next = pending
        ? {
            ...reviseOccurrence(
              current,
              pending,
              {
                amount: recurrence.amount,
                category: recurrence.category,
                account: recurrence.account,
                description: recurrence.description,
              },
              "future",
            ),
            endDate: recurrence.endDate,
          }
        : {
            ...current,
            amount: recurrence.amount,
            category: recurrence.category,
            account: recurrence.account,
            description: recurrence.description,
            endDate: recurrence.endDate,
          };
    }
    const recurrences = [
      ...data.recurrences.filter((item) => item.id !== next.id),
      next,
    ];
    const saved = await save({ ...data, recurrences });
    if (saved) {
      closeModal();
      setMessage("Recorrência salva.");
    }
    return saved;
  }

  async function saveManualInvoice(invoice: ManualInvoice, repeat: boolean) {
    const duplicate = data.manualInvoices.find(
      (item) =>
        item.id !== invoice.id &&
        item.cardId === invoice.cardId &&
        item.competence === invoice.competence,
    );
    if (duplicate) {
      if (!editingInvoice) {
        setEditingEntry(null);
        setEditingInvoice({ ...duplicate, archived: false });
        setMessage(
          "Esta fatura já existe. Abri o registro existente para edição.",
        );
      } else {
        setMessage(
          "Já existe outra fatura para este cartão e mês. Escolha um mês diferente.",
        );
      }
      return false;
    }
    if (
      invoices(data).some(
        (item) =>
          item.source === "purchase" &&
          item.card.id === invoice.cardId &&
          item.competence === invoice.competence,
      )
    ) {
      setMessage(
        "Já existem compras lançadas para este cartão e mês. Para evitar somar duas vezes, use o total calculado ou remova os lançamentos duplicados.",
      );
      return false;
    }
    const prior =
      editingInvoice ??
      data.manualInvoices.find(
        (item) =>
          item.cardId === invoice.cardId &&
          item.competence === invoice.competence,
      );
    if (
      prior &&
      data.entries.some(
        (entry) =>
          entry.type === "transfer" && entry.invoice === "manual:" + prior.id,
      ) &&
      prior.cardId !== invoice.cardId
    ) {
      setMessage(
        "Não é possível trocar o cartão de uma fatura que já recebeu pagamentos.",
      );
      return false;
    }
    const existingPlan = data.invoiceRecurrences.find(
      (plan) =>
        plan.cardId === invoice.cardId &&
        plan.status === "active" &&
        invoice.competence >= plan.startMonth &&
        (!plan.endMonth || invoice.competence <= plan.endMonth),
    );
    let recurrenceId = invoice.recurrenceId ?? existingPlan?.id ?? null;
    let invoiceRecurrences = data.invoiceRecurrences;
    if (repeat) {
      recurrenceId = existingPlan?.id ?? uid();
      const offset =
        (Number(invoice.dueDate.slice(0, 4)) -
          Number(invoice.competence.slice(0, 4))) *
          12 +
        Number(invoice.dueDate.slice(5, 7)) -
        Number(invoice.competence.slice(5, 7));
      const plan: InvoiceRecurrence = {
        id: recurrenceId,
        cardId: invoice.cardId,
        amount: invoice.total,
        startMonth: invoice.competence,
        endMonth: null,
        dueDay: Number(invoice.dueDate.slice(8, 10)),
        dueMonthOffset: Math.max(0, Math.min(2, offset)),
        status: "active",
      };
      invoiceRecurrences = [
        ...invoiceRecurrences.filter((item) => item.id !== plan.id),
        plan,
      ];
    }
    const nextInvoice = { ...invoice, recurrenceId };
    const saved = await save({
      ...data,
      invoiceRecurrences,
      manualInvoices: [
        ...data.manualInvoices.filter((item) => item.id !== invoice.id),
        nextInvoice,
      ],
    });
    if (saved) {
      setMessage("Fatura salva.");
    }
    return saved;
  }

  async function payInvoice(
    event: FormEvent<HTMLFormElement>,
    invoice: InvoiceView,
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const amount = cents(field(values, "amount"));
      const source = data.accounts.find(
        (account) => account.id === field(values, "source"),
      );
      const date = field(values, "date");
      if (!source || source.type === "card")
        throw new Error("Escolha a conta usada no pagamento.");
      if (amount <= 0 || amount > invoice.total - invoice.paid)
        throw new Error(
          "O valor deve ser maior que zero e não pode exceder o restante da fatura.",
        );
      if (date > today())
        throw new Error("Registre somente pagamentos já realizados.");
      const payment: Entry = {
        id: uid(),
        type: "transfer",
        amount,
        date,
        account: source.id,
        destination: invoice.card.id,
        category: "",
        description: "Pagamento da fatura · " + invoice.card.name,
        installments: 1,
        invoice: invoice.key,
        schedule: [],
      };
      if (await save({ ...data, entries: [...data.entries, payment] }))
        setMessage("Pagamento da fatura registrado.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function markOccurrencePaid(
    occurrence: ExpenseOccurrence,
    recurrence: ExpenseRecurrence,
  ) {
    if (occurrence.status === "paid") return;
    if (
      recurrence.account &&
      data.accounts.find((account) => account.id === occurrence.account)
        ?.type === "card"
    ) {
      const recurrences = data.recurrences.map((item) =>
        item.id === recurrence.id
          ? settleOccurrence(item, occurrence.occurrenceDate)
          : item,
      );
      if (await save({ ...data, recurrences }))
        setMessage(
          "Assinatura confirmada no planejamento. O valor não foi somado à fatura manual.",
        );
      return;
    }
    if (
      data.entries.some(
        (entry) =>
          entry.recurrenceId === recurrence.id &&
          entry.occurrenceDate === occurrence.occurrenceDate,
      )
    )
      return;
    const entry: Entry = {
      id: uid(),
      type: "expense",
      amount: occurrence.amount,
      date: today(),
      account: occurrence.account,
      destination: "",
      category: occurrence.category,
      description: occurrence.description,
      installments: 1,
      invoice: "",
      schedule: [],
      recurrenceId: recurrence.id,
      occurrenceDate: occurrence.occurrenceDate,
    };
    if (
      await save({
        ...data,
        entries: [...data.entries, entry],
        recurrences: data.recurrences.map((item) =>
          item.id === recurrence.id
            ? settleOccurrence(item, occurrence.occurrenceDate)
            : item,
        ),
      })
    )
      setMessage("Pagamento da recorrência registrado.");
  }

  async function editOccurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOccurrence) return;
    const { occurrence, recurrence } = selectedOccurrence;
    const values = new FormData(event.currentTarget);
    const date = field(values, "date");
    try {
      if (occurrence.status === "paid")
        throw new Error(
          "Uma ocorrência paga não pode ser alterada pelo planejamento.",
        );
      const amount = cents(field(values, "amount"));
      const updated = data.recurrences.map((item) =>
        item.id === recurrence.id
          ? reviseOccurrence(
              item,
              occurrence,
              {
                date,
                amount,
                category: field(values, "category"),
                account: field(values, "account"),
                description: field(values, "description").trim(),
              },
              field(values, "scope") === "future" ? "future" : "one",
            )
          : item,
      );
      if (await save({ ...data, recurrences: updated })) closeModal();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function recurrenceAction(
    recurrence: ExpenseRecurrence,
    action: "pause" | "resume" | "end" | "delete",
  ) {
    if (
      action === "delete" &&
      !confirm(
        "Excluir esta recorrência? As despesas já pagas continuam no histórico.",
      )
    )
      return;
    const recurrences = data.recurrences.flatMap((item) => {
      if (item.id !== recurrence.id) return [item];
      if (action === "delete") return [];
      return [setRecurrenceStatus(item, action)];
    });
    const entries =
      action === "delete"
        ? data.entries.map((entry) =>
            entry.recurrenceId === recurrence.id
              ? { ...entry, recurrenceId: undefined, occurrenceDate: undefined }
              : entry,
          )
        : data.entries;
    if (await save({ ...data, entries, recurrences }))
      setMessage(
        action === "delete"
          ? "Recorrência excluída."
          : action === "end"
            ? "Recorrência encerrada."
            : action === "pause"
              ? "Recorrência pausada."
              : "Recorrência reativada.",
      );
  }

  async function invoicePlanAction(
    plan: InvoiceRecurrence,
    action: "pause" | "resume" | "end",
  ) {
    const invoiceRecurrences = data.invoiceRecurrences.map((item) =>
      item.id !== plan.id
        ? item
        : action === "end"
          ? {
              ...item,
              status: "ended" as const,
              endMonth: month < item.startMonth ? item.startMonth : month,
            }
          : {
              ...item,
              status:
                action === "pause" ? ("paused" as const) : ("active" as const),
            },
    );
    if (await save({ ...data, invoiceRecurrences }))
      setMessage(
        action === "end"
          ? "Previsão encerrada."
          : action === "pause"
            ? "Previsão pausada."
            : "Previsão reativada.",
      );
  }

  async function occurrenceAction(
    occurrence: ExpenseOccurrence,
    recurrence: ExpenseRecurrence,
    action: "skip" | "restore",
  ) {
    const override = recurrence.overrides.find(
      (item) => item.occurrenceDate === occurrence.occurrenceDate,
    );
    const next = {
      ...recurrence,
      overrides: [
        ...recurrence.overrides.filter(
          (item) => item.occurrenceDate !== occurrence.occurrenceDate,
        ),
        {
          ...(override ?? {}),
          occurrenceDate: occurrence.occurrenceDate,
          skipped: action === "skip",
        },
      ],
    };
    await save({
      ...data,
      recurrences: data.recurrences.map((item) =>
        item.id === recurrence.id ? next : item,
      ),
    });
  }

  function accountHasHistory(accountId: string) {
    return (
      data.entries.some(
        (entry) =>
          entry.account === accountId || entry.destination === accountId,
      ) ||
      data.recurrences.some((recurrence) => recurrence.account === accountId) ||
      data.manualInvoices.some((invoice) => invoice.cardId === accountId) ||
      data.invoiceRecurrences.some(
        (recurrence) => recurrence.cardId === accountId,
      )
    );
  }

  async function archiveAccount(account: Account) {
    if (account.archived) return;
    if (
      !confirm(
        "Arquivar " +
          account.name +
          "? O histórico será mantido e as previsões vinculadas serão encerradas.",
      )
    )
      return;
    const invoiceRecurrences = data.invoiceRecurrences.map((plan) =>
      plan.cardId === account.id && plan.status !== "ended"
        ? {
            ...plan,
            status: "ended" as const,
            endMonth: month < plan.startMonth ? plan.startMonth : month,
          }
        : plan,
    );
    const recurrences = data.recurrences.map((recurrence) =>
      recurrence.account === account.id && recurrence.status !== "ended"
        ? setRecurrenceStatus(recurrence, "end")
        : recurrence,
    );
    if (
      await save({
        ...data,
        accounts: data.accounts.map((item) =>
          item.id === account.id ? { ...item, archived: true } : item,
        ),
        recurrences,
        invoiceRecurrences,
      })
    )
      setMessage("Conta arquivada. O histórico financeiro foi mantido.");
  }

  async function restoreAccount(account: Account) {
    if (
      await save({
        ...data,
        accounts: data.accounts.map((item) =>
          item.id === account.id ? { ...item, archived: false } : item,
        ),
      })
    )
      setMessage("Conta restaurada.");
  }

  async function deleteAccount(account: Account) {
    if (accountHasHistory(account.id)) {
      setMessage(
        "Esta conta tem histórico vinculado. Use Arquivar para removê-la da lista sem perder os registros.",
      );
      return;
    }
    if (
      confirm("Excluir " + account.name + "?") &&
      (await save({
        ...data,
        accounts: data.accounts.filter((item) => item.id !== account.id),
      }))
    )
      setMessage("Conta excluída.");
  }

  async function deleteManualInvoice(invoice: ManualInvoice) {
    const invoiceKey = "manual:" + invoice.id;
    if (
      data.entries.some(
        (entry) => entry.type === "transfer" && entry.invoice === invoiceKey,
      )
    ) {
      await archiveManualInvoice(invoice);
      return;
    }
    if (!confirm("Excluir esta fatura?")) return;
    if (
      await save({
        ...data,
        manualInvoices: data.manualInvoices.filter(
          (item) => item.id !== invoice.id,
        ),
      })
    )
      setMessage("Fatura excluída.");
  }

  async function archiveManualInvoice(invoice: ManualInvoice) {
    if (
      await save({
        ...data,
        manualInvoices: data.manualInvoices.map((item) =>
          item.id === invoice.id ? { ...item, archived: true } : item,
        ),
      })
    )
      setMessage(
        "Fatura arquivada. Os pagamentos foram mantidos no histórico.",
      );
  }

  async function restoreManualInvoice(invoice: ManualInvoice) {
    if (
      await save({
        ...data,
        manualInvoices: data.manualInvoices.map((item) =>
          item.id === invoice.id ? { ...item, archived: false } : item,
        ),
      })
    )
      setMessage("Fatura restaurada.");
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = field(values, "name").trim();
    const group = field(values, "group") as Group;
    if (!name) {
      setMessage("Informe o nome da categoria.");
      return;
    }
    if (
      data.categories.some(
        (category) =>
          category.name.trim().toLocaleLowerCase("pt-BR") ===
          name.toLocaleLowerCase("pt-BR"),
      )
    ) {
      setMessage("Essa categoria já existe.");
      return;
    }
    if (
      await save({
        ...data,
        categories: [...data.categories, { id: uid(), name, group }],
      })
    ) {
      form.reset();
      setMessage("Categoria adicionada.");
    }
  }

  async function deleteCategory(id: string) {
    const usedByEntry = data.entries.some((entry) => entry.category === id);
    const usedByRecurrence = data.recurrences.some(
      (recurrence) =>
        recurrence.category === id ||
        recurrence.overrides.some((override) => override.category === id) ||
        recurrence.revisions?.some((revision) => revision.category === id),
    );
    if (usedByEntry || usedByRecurrence) {
      setMessage(
        "Esta categoria está ligada a movimentações ou recorrências e não pode ser excluída.",
      );
      return;
    }
    if (
      confirm("Excluir esta categoria?") &&
      (await save({
        ...data,
        categories: data.categories.filter((category) => category.id !== id),
      }))
    )
      setMessage("Categoria excluída.");
  }

  async function saveIncome(value: string) {
    try {
      const income = cents(value);
      if (await save({ ...data, income })) setMessage("Renda mensal salva.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function restoreFile(file: File) {
    if (file.size > 5_000_000) throw new Error("Arquivo muito grande.");
    const imported = JSON.parse(await file.text()) as Data;
    const normalized = {
      ...initial,
      ...imported,
      recurrences: imported.recurrences ?? [],
      manualInvoices: imported.manualInvoices ?? [],
      invoiceRecurrences: imported.invoiceRecurrences ?? [],
    };
    if (
      confirm("Substituir os dados atuais pelo conteúdo deste arquivo?") &&
      (await restore(normalized))
    )
      setMessage("Cópia de segurança restaurada.");
  }

  function exportBackup() {
    const content = storageError
      ? (localStorage.getItem("mbfinancas.v1") ?? "")
      : JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "mb-financas-" + today() + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const selectedRecurrence = editingRecurrence;
  const accountTypeForModal = modal === "card" ? "card" : "bank";
  const fixedEntryType =
    modal === "income"
      ? "income"
      : modal === "transfer"
        ? "transfer"
        : modal === "expense"
          ? "expense"
          : undefined;

  return (
    <main className="finance-home">
      <header className="app-header">
        <div className="brand brand-inline">
          mb<span>Finanças da casa</span>
        </div>
        <label className="month">
          Mês
          <input
            aria-label="Mês de referência"
            type="month"
            value={month}
            onChange={(event) => setMonth(validMonth(event.target.value))}
          />
        </label>
      </header>
      {!shared && (
        <div className="local-note">
          Salvo neste navegador. Para compartilhar os dados da casa entre
          dispositivos, configure o acesso à nuvem.
        </div>
      )}
      {message && (
        <div role="status" className="notice">
          <span>{message}</span>
          <button aria-label="Fechar mensagem" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {storageError && (
        <div role="alert" className="notice">
          Os dados salvos não puderam ser lidos. Exporte o arquivo original
          antes de recuperar o armazenamento.
        </div>
      )}

      <div className="heading">
        <div>
          <span className="eyebrow">MB FINANÇAS</span>
          <h1>Minhas finanças</h1>
          <p>O resumo da casa, com as movimentações de {month}.</p>
        </div>
        <button className="primary-add" onClick={openAdd} disabled={busy}>
          + Adicionar
        </button>
      </div>

      <nav className="module-nav" aria-label="Módulos do aplicativo">
        <a href="#movements">Movimentações</a>
        <button
          type="button"
          onClick={() => {
            setReturnToInvoices(false);
            setModal("invoices");
          }}
        >
          Faturas
        </button>
        <a href="#accounts">Contas e cartões</a>
        <a href="#planning">Planejamento</a>
        <a href="#settings">Configurações</a>
      </nav>

      <section
        className="metrics compact-metrics"
        aria-label="Resumo financeiro"
      >
        <article className="metric featured">
          <span>Saldo atual das contas</span>
          <strong>{money(bankBalance)}</strong>
          <small>Contas e dinheiro, sem previsões</small>
        </article>
        <div className="monthly-metrics">
          <article className="metric income-metric">
            <span>Receitas do mês</span>
            <strong>{money(monthlyIncome)}</strong>
            <small>Entradas registradas</small>
          </article>
          <article className="metric expense-metric">
            <span>Despesas do mês</span>
            <strong>{money(monthlyExpenses)}</strong>
            <small>Inclui compras e faturas dos cartões</small>
          </article>
          <article className="metric result-metric">
            <span>Resultado do mês</span>
            <strong
              className={
                monthlyIncome - monthlyExpenses < 0 ? "negative" : "positive"
              }
            >
              {money(monthlyIncome - monthlyExpenses)}
            </strong>
            <small>Receitas menos despesas registradas</small>
          </article>
        </div>
      </section>
      <div className="dashboard-note">
        <strong>Cartões em aberto: {money(outstandingInvoices)}</strong>
        <span>
          {forecastTotal
            ? `Faturas em aberto até este mês; ${money(forecastTotal)} previstos não alteram o saldo nem as despesas até serem confirmados.`
            : "Faturas em aberto são agrupadas pelo vencimento; despesas entram pela competência da fatura."}
        </span>
      </div>

      <RecurringForecastSection
        data={data}
        currentMonth={month}
        nextMonth={nextMonth}
        currentOccurrences={currentRecurringOccurrences}
        nextOccurrences={nextRecurringOccurrences}
        onMarkOccurrence={(occurrence, recurrence) =>
          void markOccurrencePaid(occurrence, recurrence)
        }
        onEditOccurrence={(occurrence, recurrence) => {
          setSelectedOccurrence({ occurrence, recurrence });
          setModal("occurrence");
        }}
        onOccurrenceAction={(occurrence, recurrence, action) =>
          void occurrenceAction(occurrence, recurrence, action)
        }
      />

      <MovementsSection
        data={data}
        rows={visibleRows}
        search={search}
        filterType={filterType}
        filterCategory={filterCategory}
        filterAccount={filterAccount}
        onSearch={setSearch}
        onFilterType={setFilterType}
        onFilterCategory={setFilterCategory}
        onFilterAccount={setFilterAccount}
        onEditEntry={(entry) => {
          setEditingEntry(entry);
          setModal("edit-entry");
        }}
        onEditInvoice={(invoice) => {
          setEditingEntry(null);
          setEditingInvoice(invoice);
          setModal("expense");
        }}
        onDeleteInvoice={(invoice) => void deleteManualInvoice(invoice)}
        onPayInvoice={(event, invoice) => void payInvoice(event, invoice)}
        onRemoveEntry={(entry) => void removeEntry(entry)}
      />
      <AccountsSection
        data={data}
        onAddAccount={() => choose("bank")}
        onEditAccount={(account) => {
          setEditingAccount(account);
          setModal("edit-account");
        }}
        onDeleteAccount={(account) => void deleteAccount(account)}
        onArchiveAccount={(account) => void archiveAccount(account)}
        onRestoreAccount={(account) => void restoreAccount(account)}
      />

      <PlanningSection
        data={data}
        month={month}
        onNewRecurrence={() => choose("recurrence")}
        onEditRecurrence={(recurrence) => {
          setEditingRecurrence(recurrence);
          setModal("edit-recurrence");
        }}
        onRecurrenceAction={(recurrence, action) =>
          void recurrenceAction(recurrence, action)
        }
        onInvoicePlanAction={(plan, action) =>
          void invoicePlanAction(plan, action)
        }
      />
      <SettingsSection
        data={data}
        shared={shared}
        busy={busy}
        onSaveIncome={(value) => void saveIncome(value)}
        onAddCategory={(event) => void addCategory(event)}
        onDeleteCategory={(id) => void deleteCategory(id)}
        onExport={exportBackup}
        onRestoreFile={restoreFile}
        onInvite={onInvite}
        onSignOut={onSignOut}
        onMessage={setMessage}
      />
      <footer>
        MB Finanças ·{" "}
        {shared
          ? "Casa compartilhada · atualização em até 15 segundos"
          : "Dados salvos neste navegador"}
        {busy ? " · Salvando…" : ""}
      </footer>

      <Dialog open={modal !== null} onClose={closeModal}>
        {modal === "invoices" && (
          <InvoicesSection
            data={data}
            month={month}
            bills={invoiceBills}
            onClose={() => {
              setReturnToInvoices(false);
              closeModal();
            }}
            onAddInvoice={() => {
              setReturnToInvoices(true);
              setEditingEntry(null);
              setEditingInvoice(null);
              setNewInvoiceCardId("");
              setModal("invoice-entry");
            }}
            onEditInvoice={(invoice) => {
              setReturnToInvoices(true);
              setEditingEntry(null);
              setEditingInvoice(invoice);
              setModal("expense");
            }}
            onDeleteInvoice={(invoice) => void deleteManualInvoice(invoice)}
            onArchiveInvoice={(invoice) => void archiveManualInvoice(invoice)}
            onRestoreInvoice={(invoice) => void restoreManualInvoice(invoice)}
            onPayInvoice={(event, invoice) => void payInvoice(event, invoice)}
            onConfirmForecast={(invoice) => {
              setReturnToInvoices(true);
              setEditingEntry(null);
              setEditingInvoice(null);
              setNewInvoiceCardId(invoice.card.id);
              setModal("invoice-entry");
            }}
            onCancelForecast={(invoice) => {
              const plan = data.invoiceRecurrences.find(
                (item) => item.id === invoice.recurrenceId,
              );
              if (
                plan &&
                confirm("Encerrar esta previsão e os próximos meses?")
              )
                void invoicePlanAction(plan, "end");
            }}
          />
        )}
        {modal === "menu" && (
          <section className="panel modal-panel add-menu">
            <div className="section-title">
              <div>
                <h2>O que deseja adicionar?</h2>
                <small>Escolha um tipo de registro.</small>
              </div>
              <button className="ghost" onClick={closeModal}>
                Fechar
              </button>
            </div>
            <div className="add-options">
              {(
                [
                  ["expense", "Nova despesa", "↓"],
                  ["income", "Nova receita", "↑"],
                  ["transfer", "Nova transferência", "↔"],
                  ["bank", "Nova conta bancária", "▤"],
                  ["card", "Novo cartão", "▣"],
                  ["recurrence", "Nova despesa recorrente", "◷"],
                ] as [Modal, string, string][]
              ).map(([kind, label, icon]) => (
                <button
                  key={kind}
                  className="add-option"
                  onClick={() => choose(kind)}
                >
                  <span>{icon}</span>
                  {label}
                  <b>›</b>
                </button>
              ))}
            </div>
          </section>
        )}
        {(modal === "expense" ||
          modal === "invoice-entry" ||
          modal === "income" ||
          modal === "transfer" ||
          modal === "edit-entry") && (
          <EntryForm
            key={`${modal}-${editingEntry?.id ?? editingInvoice?.id ?? newInvoiceCardId ?? "new"}`}
            data={data}
            editing={editingEntry}
            invoice={editingInvoice}
            month={month}
            invoiceCardId={newInvoiceCardId}
            startAsInvoice={modal === "invoice-entry"}
            fixedType={
              editingInvoice
                ? "expense"
                : modal === "invoice-entry"
                  ? "expense"
                  : modal === "edit-entry"
                    ? editingEntry?.type
                    : fixedEntryType
            }
            onSubmit={(event, type, account) =>
              void submitEntry(event, type, account)
            }
            onSaveInvoice={saveManualInvoice}
            onError={setMessage}
            onCancel={closeModal}
          />
        )}
        {(modal === "bank" || modal === "card" || modal === "edit-account") && (
          <AccountForm
            key={editingAccount?.id ?? modal}
            account={editingAccount ?? undefined}
            accountType={accountTypeForModal}
            allowCash={modal === "bank"}
            typeLocked={
              modal === "card" ||
              (modal === "edit-account" &&
                !!editingAccount &&
                data.entries.some(
                  (entry) =>
                    entry.account === editingAccount.id ||
                    entry.destination === editingAccount.id,
                ))
            }
            onSave={saveAccount}
            onError={setMessage}
            onCancel={closeModal}
          />
        )}
        {(modal === "recurrence" || modal === "edit-recurrence") && (
          <RecurrenceForm
            accounts={data.accounts}
            categories={data.categories}
            recurrence={selectedRecurrence ?? undefined}
            onSave={saveRecurrence}
            onCancel={closeModal}
            onError={setMessage}
          />
        )}
        {modal === "occurrence" && selectedOccurrence && (
          <section className="panel modal-panel">
            <div className="section-title">
              <div>
                <h2>Editar ocorrência</h2>
                <small>
                  {selectedOccurrence.occurrence.description} ·{" "}
                  {dateLabel(selectedOccurrence.occurrence.occurrenceDate)}
                </small>
              </div>
              <button className="ghost" onClick={closeModal}>
                Fechar
              </button>
            </div>
            <form
              className="grid-form"
              onSubmit={(event) => void editOccurrence(event)}
            >
              <label>
                Descrição
                <input
                  name="description"
                  required
                  maxLength={120}
                  defaultValue={selectedOccurrence.occurrence.description}
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
                  defaultValue={selectedOccurrence.occurrence.amount / 100}
                />
              </label>
              <label>
                Vencimento
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={selectedOccurrence.occurrence.date}
                />
              </label>
              <label>
                Categoria
                <select
                  name="category"
                  defaultValue={selectedOccurrence.occurrence.category}
                >
                  {data.categories.map((category) => (
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
                  defaultValue={selectedOccurrence.occurrence.account}
                >
                  {data.accounts
                    .filter(
                      (account) =>
                        !account.archived ||
                        account.id === selectedOccurrence.occurrence.account,
                    )
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Aplicar a
                <select name="scope">
                  <option value="one">Somente esta ocorrência</option>
                  <option value="future">Esta e as futuras</option>
                </select>
              </label>
              <div className="form-actions">
                <button>Salvar alteração</button>
              </div>
            </form>
          </section>
        )}
      </Dialog>
    </main>
  );
}
