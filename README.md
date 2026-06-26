# Helm

A local-first personal finance tracker built around a specific idea: **live entirely on one income, save the other**. Log monthly income and expenses, maintain persistent asset and debt accounts, track credit card spending separately, and measure your savings trajectory against House and Emergency Fund goals. Ships as a desktop app (Electron) — no browser, server, or account required.

| macOS   | [Download .dmg](https://github.com/OWNER/helm/releases/latest/download/Helm-1.0.0-arm64.dmg) |
| Linux   | [Download .deb](https://github.com/OWNER/helm/releases/latest/download/helm_1.0.0_amd64.deb) |
| Windows | [Download .exe](https://github.com/OWNER/helm/releases/latest/download/Helm-Setup-1.0.0.exe) |

## Getting started (development)

```bash
npm install
npm run electron:dev
```

This runs the Vite dev server and an Electron window pointed at it together,
with hot reload. (`npm run dev` alone still works for quick UI-only
iteration in a regular browser tab, but any screen that reads/writes data
needs `window.api`, which only exists inside Electron — so use
`electron:dev` whenever you're touching snapshots, scenarios, cards, or
balances.)

## Building the .deb package

```bash
npm run dist:linux
```

This builds the Vite bundle (`npm run build` runs first, then electron-builder)
and packages it into a `.deb` file under `release/`. Install it with:

```bash
sudo dpkg -i release/helm_*.deb
```

Before building a release, open `package.json` and replace the placeholder
`"author"` (used as the Debian package maintainer) and `"appId"` with your
own values.

## How your data is stored

All data lives in a single JSON file on disk, in your user config
directory — there is no server, no browser storage, and nothing leaves
your machine:

- Linux: `~/.config/helm/data.json`
- macOS: `~/Library/Application Support/helm/data.json`
- Windows: `%APPDATA%/helm/data.json`

This path comes from Electron's `app.getPath('userData')`, with the app
name locked via `app.setName()` in `electron/main.cjs` so it stays stable
regardless of how the packaged app's display name is capitalized. **Settings**
shows the exact path for your machine. All reads/writes happen in the main
process (`electron/store.cjs`), written atomically (temp file + rename) so a
crash mid-write can't corrupt the file.

Use **Settings → Export backup** periodically to save a JSON file via a
native save dialog. **Settings → Import backup** restores from that file
(and replaces whatever is currently stored) via a native open dialog.

### Upgrading from an earlier version

If you're applying the Accounts redesign on top of an existing install:
your data migrates automatically the first time the app loads afterward
(see "The core data model" below for exactly what that migration does) —
no manual data steps needed. Two files are fully superseded by this
change and should be **deleted** from the project, since nothing imports
them anymore: `src/stores/fundAccountsStore.js` and
`src/components/FundAccountForm.vue`.

## How it's organized

```
electron/
  main.cjs              App window + all ipcMain handlers (the only code
                         that talks to electron/store.cjs)
  preload.cjs            contextBridge: exposes window.api to the renderer
  store.cjs               Reads/writes data.json in the userData dir
  csvImport.cjs            Pure CSV parsing/categorization (no Electron
                            dependency) for credit card statement imports
src/
  stores/
    financeStore.js      Monthly snapshots: CRUD + computed totals/history
    goalsStore.js          Goals (House or Emergency Fund): CRUD + live projections
    creditCardStore.js     Credit card accounts + their monthly balance log
    settingsStore.js        App-wide settings (trailing average window)
    categoriesStore.js       The managed category list (Settings → Categories)
    accountsStore.js          Assets & debts: persistent named accounts +
                               their own per-month balance log (the same
                               pattern as creditCardStore.js), absorbing
                               what used to be a separate fund-accounts
                               concept — goal-tagging, growth rates, and
                               contribution targets all live here now
                          (all six call window.api.* — never touch the
                          filesystem directly from the renderer)
  utils/
    projections.js       The math: future value, months-to-goal,
                          required monthly contribution
    affordability.js       The math for the Home Affordability calculator:
                            mortgage payment, 28/36 ratios, the green/
                            yellow/red score — pure functions, no store
                            dependency, nothing persisted
    format.js             Currency/percent formatting + deepClone (strips
                           Vue reactivity before data crosses the IPC bridge)
    chartColors.js          Shared chart palette + categoryColor() — a
                             deterministic per-category-name color so e.g.
                             "Groceries" renders the same color in every
                             chart, regardless of that chart's sort order
  components/             Reusable UI pieces (forms, charts, cards) —
                           CardMonthPanel.vue is the per-card, per-month
                           entry panel (itemizing, CSV import) shared by
                           both the "last month" and "this month" panels
                           on each credit card; CategoryTrendsChart.vue
                           is the stacked-bar category-over-time chart;
                           AccountForm.vue / AccountMonthPanel.vue /
                           AccountRow.vue are the Accounts page's add/edit
                           form, simple month-entry panel (no itemizing/
                           CSV — those are credit-card-specific), and
                           per-account display + history, respectively
  views/                  One component per route (Dashboard, Monthly Entry,
                           Accounts, History, Credit Cards, Goals,
                           Affordability, Settings)
```


### The core data model

Each **monthly snapshot** has two line-item lists: income and expenses.
The Month field on the entry form is a navigation control, not just a
label — changing it (whether starting a fresh entry, or while editing an
existing one from History) looks up whatever's actually saved for that
month and loads it, or resets to a clean blank entry if nothing's saved
for it yet. It never just leaves the previous month's typed-in values
sitting there under a new label, and it never risks renaming an existing
record to a different month by accident (a real risk before this was
fixed: editing March, then changing the field to April, used to save by
that record's id regardless of month — silently turning your March entry
into a second, conflicting "April" record). The Expenses list is for
spending *not* on a tracked card (rent, autopay bills, cash) — credit card
spending is tracked separately and rolls in automatically (see below).
Each expense line item can optionally carry a free-text **category** —
autocompleted from both categories you've used before *and* the curated
list at Settings → Categories (add/rename/delete there; renaming cascades
to every expense item and card-balance line that used the old name) —
which feeds the Dashboard's spending-by-category chart and its category
trends chart. Uncategorized expenses are grouped as "Uncategorized," and a
month's card spend is merged in by its *real* categories where it's been
itemized (so "Groceries" on a card and "Groceries" entered manually land
in the same bucket) — falling back to "Uncategorized" for any card balance
logged as a single total. The breakdown always sums to the month's full
Expenses total either way. The **category trends** chart does the same
breakdown across every logged month (not just the latest) as a stacked
bar, capped to the top categories by all-time total with everything else
folded into "Other," so it stays readable no matter how many categories
exist.

**Accounts** (assets and debts) are *not* part of the monthly snapshot at
all — they're persistent named entities with their own per-month balance
log, the exact same pattern Credit Cards already use, managed on their own
**Accounts** page. This replaced an earlier design where assets/debts were
just freeform line items retyped by hand into every snapshot: that meant
re-typing "Checking," "401k," "Car Loan," etc. every single month with no
real link between one month's "Checking" and the next's, and a current
balance that was only ever read from the single latest snapshot — so
forgetting to re-log one account in a given month silently zeroed it out
everywhere it was used, including Goals projections. Now, each account's
current balance is its own most recent logged entry, independent of any
other account or snapshot, and a month's "as of" balance (used for
historical net worth) carries the last known value forward if that
specific month wasn't re-logged — an asset/debt balance is a stock, not a
flow like credit card spend, so a skipped month means "didn't change," not
"$0." Each asset account can optionally be tagged to a goal (House Fund or
Emergency Fund — this absorbed what used to be a separate Fund Accounts
entity) with its own assumed annual growth rate and an optional monthly
contribution target, tracking it like a protected transfer the same way
retirement contributions implicitly already are. A goal's current balance
is the sum of every account tagged to it; the growth rate used in its
projection is a **balance-weighted average** across those same accounts —
a $30k HYSA at 4.5% and a $10k brokerage at 7% blend to ~5.1%, weighted
toward whichever account actually holds more of the money — so every
scenario of the same goal type shares one consistent, account-derived
rate rather than each one risking a different manually-typed guess.
Deleting an account deletes its balance history too (unlike the old Fund
Accounts, there's no "unassigned but still real" state — every dollar
belongs to a specific account or it isn't tracked). Debt accounts are
intentionally minimal for now — just a name and a balance log, no interest
rate or payment fields yet (that's a separate, not-yet-built debt-tracker
feature) — but they're full persistent accounts with real history, ready
to be extended later.

Existing data from before this redesign migrates automatically on first
load, in two chained, idempotent steps: any asset item that still had the
older `forHouseFund`/`forEmergencyFund` checkboxes (itself a since-replaced
mechanism) gets promoted into a Fund Account first, exactly as it always
has; then every snapshot's asset/debt line items — tagged or not — get
folded into the new Accounts system, grouped into one account per
distinct (trimmed, case-insensitive) label across every snapshot, since a
typed label was the closest thing freeform line items ever had to a
stable identity. Nothing is lost, but it's worth a quick look afterward:
if you were inconsistent with a name (e.g. "401k" one month, "401K" the
next still merges fine since matching is case-insensitive, but "401k
account" wouldn't), you may end up with near-duplicate accounts worth
merging by hand — rename one and delete the other; deleting only removes
that one account's own (likely thin) history.

Each account can also carry an optional **monthly contribution target** —
treats it like a protected transfer, the same way retirement contributions
typically happen automatically before discretionary spending gets a shot
at the money. There's no separate "transfer" transaction tracked anywhere
(that would risk double-counting against the asset balance itself); instead,
each month an account's *actual* contribution is inferred as the balance
change since the last month that account was logged — which does mean it
includes any account growth/interest alongside real transfers in, not just
literal deposits. A skipped month doesn't break this: it diffs against the
previous month the account *actually* appears in, not necessarily the
prior calendar month. Each account's card on the Accounts page shows its
own target vs. this month's actual (met/short); Goals shows a combined
total per fund type across every account that has a target set.

**Credit cards** are tracked as spending accounts, not debt — this app
assumes you pay them off in full each cycle via auto-pay, so a balance
never carries forward into your net worth. Each card is set up once
(name + optional monthly budget target), then has two separate entries:
**Last month's statement** (the previous calendar month, cleared
automatically on its settlement date) and **This month so far** (a
ticking total for the still-open current month — re-logging it updates
the existing entry rather than creating a duplicate). The total across
all cards for a given month is added to that month's Expenses
automatically — you never need to double-enter card spending in the
manual list. Either entry can optionally be split across categories
("Split by category"), or filled in one shot via **Import CSV** (parses
a transaction export — Apple Card's column layout out of the box, but
any CSV with recognizable Amount/Category/Type columns works; `Payment`
rows are excluded as they're you paying down the balance, not spend).
Months logged as a single total are bucketed as "Uncategorized" in that
card's breakdown chart, so the chart always accounts for the card's full
spend. Anything older than last month — within the "View history" list —
gets the same full editor (amount, itemizing, CSV import) via its row's
**Edit** button, or you can open any arbitrary month (even one never
logged before) with the month picker above the history table.

The Credit Cards page has two tabs: **Cards** (the per-card panels above,
plus the all-cards spending trend) and **Categories** — a period selector
(any logged month, or "All time") above an all-cards-combined breakdown
chart and a side-by-side grid of each individual card's breakdown for that
same period. Cards with nothing logged for the selected period are
skipped rather than shown empty.

**Goals** come in two types:
- **House** — home price, down payment %, optional closing costs %.
  Progress is measured against assets assigned to a House Fund account.
- **Emergency Fund** — either a flat dollar target, or a target based on a
  number of months of your trailing average expenses (which includes card
  spend). Progress is measured against assets assigned to an Emergency
  Fund account.

For either type, choose one of two modes:

- **Project from your savings rate** — give it a fixed monthly
  contribution, or leave it blank to use your trailing 6-month average
  cash flow automatically. The app tells you the projected date you'd hit
  your target.
- **Work backward from a date** — pick a target month, and the app tells
  you the monthly contribution required to get there.

Goals update live as you log new months, card balances, or account
changes, since they pull current totals and blended growth rates from the
finance, credit card, and accounts stores.

**Home Affordability** is a standalone calculator, separate from Goals —
punch in a price you're considering and it's checked against two
independent signals: **payment affordability** (the standard 28/36
lending guideline — housing costs at or under 28% of gross income, total
debt at or under 36% — a widely-used industry rule of thumb, not a
pre-approval or a guarantee) and **cash readiness** (whether your actual
House Fund balance covers the down payment + estimated closing costs for
that price). These are deliberately kept separate rather than combined
into one score — a price can be very affordable on an ongoing-payment
basis while you're still early in saving the cash for it, and conflating
the two would misrepresent which problem (if either) you actually have.
The calculator's inputs aren't persisted, but their *starting values* are
— set them once at Settings → Affordability Defaults (gross monthly
income, mortgage rate, property tax rate, insurance, HOA, other monthly
debt, closing cost %) so you're not retyping the same assumptions every
visit. Gross monthly income especially matters: it's deliberately kept
separate from logged snapshot income, since "Income" in Monthly Entry is
whatever actually lands in your spendable accounts, which may already
exclude things like an automatic retirement transfer taken before the
paycheck hits checking — not the same as gross/pre-tax salary. Until a
default's set, fields fall back to a generic placeholder (price/closing
costs from an existing House goal if you have one, gross income from a
rough average of logged income, everything else a reasonable starting
guess) — all fully editable per calculation either way.

## Extending it

A few natural next steps if you want to keep building:

- Full per-account projection simulation (each account compounding
  independently at its own rate, rather than one blended rate) — more
  accurate when accounts have very different rates or contribution
  patterns, at the cost of needing per-account contribution-split input
- Debt tracker with per-debt *detail* — interest rate, minimum payment,
  payoff timeline. Partially unblocked by the Accounts redesign: debt
  accounts already have a real identity and balance history now, they
  just don't carry a rate/payment yet (intentionally deferred — see "The
  core data model"), so this would mean adding those fields rather than
  building persistent debt tracking from scratch. Still why the
  Affordability calculator asks for "other monthly debt payments" as a
  manual input instead of pulling it from an account.
- Retirement account tracking (401k, brokerage, Roth) as its own concept.
  A 401k can already be tracked as a plain asset account (with or without
  a goal tag) and gets real balance history — what's missing is anything
  401k/retirement-specific (employer match modeling, contribution limits,
  vesting), not basic tracking.

## License

Helm is licensed under the [GNU Affero General Public License v3.0](LICENSE).