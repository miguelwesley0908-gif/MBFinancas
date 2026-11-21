import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  cents,
  expenseTotalForMonth,
  initial,
  invoices,
  money,
  nextUnsettledOccurrence,
  occurrenceForMonth,
  projectedExpenseTotalForMonth,
  reviseOccurrence,
  schedule,
  setRecurrenceStatus,
  settleOccurrence,
  today,
  uid,
  upgradeData,
  type Account,
  type Data,
  type Entry,
  type ExpenseOccurrence,
  type ExpenseRecurrence,
  type Group,
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
import { BrandLogo } from "./components/BrandLogo";
import { AccountForm } from "./components/AccountForm";
import { EntryForm } from "./components/EntryForm";
import { RecurrenceForm } from "./components/RecurrenceForm";

type Modal =
  | "menu"
  | "invoices"
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
type MainView = "overview" | "movements" | "accounts" | "planning" | "settings";
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
const monthTitle = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  const title = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, value - 1, 1)));
  return title.charAt(0).toLocaleUpperCase("pt-BR") + title.slice(1);
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
  const [activeView, setActiveView] = useState<MainView>("overview");
  const [modal, setModal] = useState<Modal | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeView]);

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
      invoice.date.slice(0, 7) === month ||
      (invoice.paymentKeys ?? [invoice.key]).some((key) =>
        paymentKeysThisMonth.has(key),
      ) ||
      (invoice.paid < invoice.total && invoice.date.slice(0, 7) <= month),
  );
  const invoiceBills = invoicesForMonth.sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const monthlyIncome = monthlyEntries
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyExpenses = expenseTotalForMonth(data, month);
  const projectedExpenses = projectedExpenseTotalForMonth(data, month);
  const nextProjectedExpenses = projectedExpenseTotalForMonth(data, nextMonth);
  const outstandingInvoices = invoiceBills
    .filter((invoice) => invoice.source !== "forecast")
    .reduce(
      (sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid),
      0,
    );
  const visibleRows = monthlyEntries
    .map((entry) => ({ kind: "entry" as const, date: entry.date, entry }))
    .filter((row) => {
      const entryDestination =
        row.entry.type === "transfer"
          ? data.accounts.find(
              (account) => account.id === row.entry.destination,
            )
          : undefined;
      const entryTitle =
        row.entry.type === "transfer" && row.entry.invoice
          ? `Pagamento da fatura · ${entryDestination?.name ?? "Cartão"}`
          : row.entry.description;
      const categoryName =
        data.categories.find((category) => category.id === row.entry.category)
          ?.name ?? "";
      const text = `${entryTitle} ${categoryName} ${entryDestination?.name ?? ""}`;
      const type = row.entry.type;
      const category = row.entry.category;
      const matchesAccount =
        row.entry.account === filterAccount ||
        (row.entry.type === "transfer" &&
          row.entry.destination === filterAccount);
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
  function openInvoices() {
    setReturnToInvoices(false);
    setModal("invoices");
  }
  function choose(kind: Modal) {
    setModal(kind);
    setReturnToInvoices(false);
    setEditingEntry(null);
    setEditingAccount(null);
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
      const nextSchedule =
        type === "expense" && account.type === "card"
          ? schedule(amount, count, date, account)
          : [];
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
        schedule: nextSchedule,
        recurrenceId: editingEntry?.recurrenceId,
        occurrenceDate: editingEntry?.occurrenceDate,
      };
      if (
        editingEntry &&
        invoices(data).some(
          (invoice) =>
            invoice.paid > 0 &&
            editingEntry.schedule.some(
              (part) =>
                invoice.card.id === editingEntry.account &&
                    invoice.date.slice(0, 7) === part.date.slice(0, 7),
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
            (part) =>
              invoice.card.id === entry.account &&
              invoice.date.slice(0, 7) === part.date.slice(0, 7),
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
      if (
        await save({
          ...upgradeData(data),
          entries: [...data.entries, payment],
        })
      )
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
    const invoiceView = invoices(data).find(
      (item) => item.invoiceId === invoice.id,
    );
    if (invoiceView && invoiceView.paid > 0) {
      await archiveManualInvoice(invoice);
      return;
    }
    const hasPurchaseDetails = !!invoiceView?.purchaseDetails?.length;
    if (
      !confirm(
        hasPurchaseDetails
          ? "Excluir o total informado? As compras detalhadas serão mantidas e a fatura será recalculada pelas parcelas."
          : "Excluir esta fatura?",
      )
    )
      return;
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
  const viewCopy: Record<MainView, { title: string; description: string }> = {
    overview: {
      title: "Minhas finanças",
      description: `Resumo da casa em ${month}.`,
    },
    movements: {
      title: "Movimentações",
      description: `Entradas, despesas e faturas de ${month}.`,
    },
    accounts: {
      title: "Contas e cartões",
      description: "Saldos bancários e cartões cadastrados.",
    },
    planning: {
      title: "Planejamento",
      description: "Previsões, recorrências e faturas da casa.",
    },
    settings: {
      title: "Mais opções",
      description: "Faturas, preferências e dados da casa.",
    },
  };
  const movementHandlers = {
    search,
    filterType,
    filterCategory,
    filterAccount,
    onSearch: setSearch,
    onFilterType: setFilterType,
    onFilterCategory: setFilterCategory,
    onFilterAccount: setFilterAccount,
    onEditEntry: (entry: Entry) => {
      setEditingEntry(entry);
      setModal("edit-entry");
    },
    onRemoveEntry: (entry: Entry) => void removeEntry(entry),
  };
  const recurrenceHandlers = {
    onMarkOccurrence: (
      occurrence: ExpenseOccurrence,
      recurrence: ExpenseRecurrence,
    ) => void markOccurrencePaid(occurrence, recurrence),
    onEditOccurrence: (
      occurrence: ExpenseOccurrence,
      recurrence: ExpenseRecurrence,
    ) => {
      setSelectedOccurrence({ occurrence, recurrence });
      setModal("occurrence");
    },
    onOccurrenceAction: (
      occurrence: ExpenseOccurrence,
      recurrence: ExpenseRecurrence,
      action: "skip" | "restore",
    ) => void occurrenceAction(occurrence, recurrence, action),
  };

  return (
    <main className="finance-home">
      <header className="app-header">
        <div className="brand brand-inline">
          <BrandLogo />
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
          <h1>{viewCopy[activeView].title}</h1>
          <p>{viewCopy[activeView].description}</p>
        </div>
        <button className="primary-add" onClick={openAdd} disabled={busy}>
          + Adicionar
        </button>
      </div>

      <nav
        className="module-nav desktop-module-nav"
        aria-label="Módulos do aplicativo"
      >
        {(
          [
            ["overview", "Resumo"],
            ["movements", "Movimentações"],
            ["accounts", "Contas e cartões"],
            ["planning", "Planejamento"],
            ["settings", "Configurações"],
          ] as [MainView, string][]
        ).map(([view, label]) => (
          <button
            className={activeView === view ? "active" : ""}
            aria-current={activeView === view ? "page" : undefined}
            key={view}
            type="button"
            onClick={() => setActiveView(view)}
          >
            {label}
          </button>
        ))}
        <button
          className="invoice-nav-button"
          type="button"
          onClick={openInvoices}
        >
          Faturas
        </button>
      </nav>

      {activeView === "overview" && (
        <>
          <section
            className="projection-panel panel"
            aria-labelledby="projection-title"
          >
            <div className="section-title">
              <div>
                <h2 id="projection-title">Previsão mensal</h2>
                <small>
                  Projeção para o mês selecionado e o próximo, baseada na renda
                  informada e nos compromissos registrados.
                </small>
              </div>
            </div>
            <div className="projection-month-grid">
              {[
                {
                  month,
                  label: "Mês selecionado",
                  expenses: projectedExpenses,
                },
                {
                  month: nextMonth,
                  label: "Próximo mês",
                  expenses: nextProjectedExpenses,
                },
              ].map((projection) => (
                <article
                  className="projection-month-card"
                  key={projection.month}
                >
                  <div className="projection-month-heading">
                    <small>{projection.label}</small>
                    <h3>{monthTitle(projection.month)}</h3>
                  </div>
                  <dl className="projection-values">
                    <div>
                      <dt>Renda prevista</dt>
                      <dd>{money(data.income)}</dd>
                    </div>
                    <div>
                      <dt>Gastos previstos</dt>
                      <dd>{money(projection.expenses)}</dd>
                    </div>
                    <div className="projection-margin">
                      <dt>Quanto deve sobrar</dt>
                      <dd
                        className={
                          data.income - projection.expenses < 0
                            ? "negative"
                            : "positive"
                        }
                      >
                        {money(data.income - projection.expenses)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <details className="projection-explainer">
              <summary>Como calculamos a projeção</summary>
              <p>
                A renda prevista vem de “Renda mensal prevista” nas
                configurações. As despesas projetadas somam os gastos já
                registrados no mês, recorrências ainda pendentes e previsões
                ativas de faturas sem lançamentos. Uma fatura já representada
                não soma novamente as recorrências daquele cartão. A margem é a
                renda prevista menos as despesas projetadas. Os valores
                realizados aparecem separadamente abaixo.
              </p>
            </details>
          </section>

          <section className="actual-summary" aria-labelledby="actual-title">
            <div className="section-title">
              <div>
                <h2 id="actual-title">Gastos e receitas do mês</h2>
                <small>
                  Gastos no cartão entram uma vez, no mês do vencimento da fatura.
                </small>
              </div>
            </div>
            <div className="actual-metric-grid">
              <article className="metric income-metric">
                <span>Receitas recebidas</span>
                <strong>{money(monthlyIncome)}</strong>
              </article>
              <article className="metric expense-metric">
                <span>Gastos realizados</span>
                <strong>{money(monthlyExpenses)}</strong>
              </article>
              <article className="metric result-metric">
                <span>Resultado do mês</span>
                <strong
                  className={
                    monthlyIncome - monthlyExpenses < 0
                      ? "negative"
                      : "positive"
                  }
                >
                  {money(monthlyIncome - monthlyExpenses)}
                </strong>
              </article>
            </div>
          </section>

          <div className="dashboard-note">
            <strong>
              Faturas em aberto: {money(outstandingInvoices)}
            </strong>
            <span>Compras aparecem nas movimentações; o total considera a fatura uma só vez.</span>
          </div>
          <div className="overview-grid">
            <MovementsSection
              data={data}
              rows={visibleRows}
              preview
              onViewAll={() => setActiveView("movements")}
              {...movementHandlers}
            />
            <RecurringForecastSection
              data={data}
              currentMonth={month}
              nextMonth={nextMonth}
              currentOccurrences={currentRecurringOccurrences}
              nextOccurrences={nextRecurringOccurrences}
              preview
              onViewAll={() => setActiveView("planning")}
              {...recurrenceHandlers}
            />
          </div>
        </>
      )}

      {activeView === "movements" && (
        <MovementsSection
          data={data}
          rows={visibleRows}
          {...movementHandlers}
        />
      )}

      {activeView === "accounts" && (
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
      )}

      {activeView === "planning" && (
        <>
          <RecurringForecastSection
            data={data}
            currentMonth={month}
            nextMonth={nextMonth}
            currentOccurrences={currentRecurringOccurrences}
            nextOccurrences={nextRecurringOccurrences}
            {...recurrenceHandlers}
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
          />
        </>
      )}

      {activeView === "settings" && (
        <>
          <section className="panel quick-links-panel">
            <div>
              <h2>Faturas</h2>
              <small>Consulte faturas abertas, pagas e previstas.</small>
            </div>
            <button type="button" onClick={openInvoices}>
              Abrir faturas
            </button>
          </section>
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
        </>
      )}
      <nav className="mobile-bottom-nav" aria-label="Navegação principal">
        {(
          [
            ["overview", "Resumo", "⌂", "Resumo"],
            ["movements", "Movimentos", "↕", "Movimentações"],
            ["accounts", "Cartões", "▣", "Contas e cartões"],
            ["planning", "Plano", "◷", "Planejamento"],
            ["settings", "Mais", "•••", "Mais opções"],
          ] as [MainView, string, string, string][]
        ).map(([view, label, icon, accessibleLabel]) => (
          <button
            className={activeView === view ? "active" : ""}
            aria-current={activeView === view ? "page" : undefined}
            aria-label={accessibleLabel}
            key={view}
            type="button"
            onClick={() => setActiveView(view)}
          >
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>

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
            onAddPurchase={(invoice) => {
              setReturnToInvoices(true);
              setEditingEntry(null);
              setNewInvoiceCardId(invoice?.card.id ?? "");
              setModal("expense");
            }}
            onDeleteInvoice={(invoice) => void deleteManualInvoice(invoice)}
            onArchiveInvoice={(invoice) => void archiveManualInvoice(invoice)}
            onRestoreInvoice={(invoice) => void restoreManualInvoice(invoice)}
            onPayInvoice={(event, invoice) => void payInvoice(event, invoice)}
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
          modal === "income" ||
          modal === "transfer" ||
          modal === "edit-entry") && (
          <EntryForm
            key={`${modal}-${editingEntry?.id ?? newInvoiceCardId ?? "new"}`}
            data={data}
            editing={editingEntry}
            invoiceCardId={newInvoiceCardId}
            startAsCardPurchase={
              modal === "expense" && returnToInvoices && !editingEntry
            }
            fixedType={modal === "edit-entry" ? editingEntry?.type : fixedEntryType}
            onSubmit={(event, type, account) =>
              void submitEntry(event, type, account)
            }
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
