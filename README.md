# MB Finanças

Aplicação para organizar as finanças da casa em uma tela: contas, receitas, despesas, compras no cartão, faturas, recorrências, orçamento 50/30/20 e cópias de segurança.

## Ambiente conectado

Projeto MB Finanças criado na organização Miguel Wesley, região São Paulo, com custo informado de US$ 0/mês. Painel: https://supabase.com/dashboard/project/klrjbrfwjjqtqdeqhltm

Este workspace já contém .env.local com URL e chave publicável. O esquema inicial já foi aplicado e a função invite-member está publicada. Não execute setup.sql novamente neste projeto.

A validação SQL para os novos campos de recorrência e faturas está em `supabase/migrations/20261119_finance_planning.sql`. Ela não é executada pelo deploy do frontend e ainda não foi aplicada ao projeto conectado. A validação do app já protege os dados; para ativar também a validação no RPC do Supabase, aplique esse arquivo manualmente no SQL Editor depois de revisar o diff. Nenhuma alteração foi feita diretamente no banco hospedado.

Foram verificados: leitura/escrita dos membros, isolamento entre casas, rejeição de versão desatualizada, e-mail do destinatário do convite, aceitação repetida do mesmo convite e bloqueio de chamadas anônimas. A transação de teste foi desfeita; o projeto está sem usuários e dados financeiros. A tela de login e os endpoints públicos também foram verificados.

Ainda não configurados: SMTP de autenticação, segredos APP_URL/RESEND_API_KEY/EMAIL_FROM da função e endereço público do frontend. Não houve envio de e-mails nem cadastro real. A função retorna erro de configuração quando um usuário autenticado tenta enviar sem esses dados.

O verificador Supabase sinaliza três funções SECURITY DEFINER executáveis por autenticados. Isso é intencional para as operações atômicas; cada função valida identidade, participação ou destinatário, usa search_path vazio e não está disponível a anônimos. As proteções foram exercitadas por supabase/verify-access.sql. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
Os índices ainda sem uso foram mantidos porque o projeto está vazio. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Rodar no computador

Requer Node.js 24 ou superior.

    npm.cmd install
    npm.cmd run dev

Abra o endereço mostrado no terminal. Sem configuração do Supabase, o app usa o armazenamento deste navegador. Não há login fictício. Os dados locais não são compartilhados entre dispositivos. Exporte backups em Configurações.

No Windows, npm.cmd evita o bloqueio do script npm.ps1 pelo PowerShell.

## Organização do app

A página **Minhas finanças** reúne os quatro indicadores, movimentações, contas e cartões e faturas do mês. O seletor de período começa no mês atual e mantém a última escolha válida neste navegador. O botão **+ Adicionar** abre os oito cadastros centrais; cada formulário mostra somente os campos daquele registro. Planejamento e configurações ficam recolhidos até serem necessários.

Movimentações são lançamentos reais. Transferências alteram somente os saldos das contas de origem e destino. Despesas recorrentes geram previsões sob demanda para o período consultado, sem criar meses futuros no banco. Marcar uma ocorrência paga em conta registra uma despesa real na data do pagamento. Uma assinatura ligada a cartão pode ser confirmada no planejamento sem virar uma compra itemizada; ela não é adicionada ao total da fatura manual.

As faturas manuais usam cartão, competência, total e vencimento. Repetir o valor nos meses seguintes é opcional e começa desativado. Uma fatura confirmada substitui a previsão daquele cartão e mês; editar um mês não muda os próximos. Pagamentos, inclusive parciais, são transferências da conta bancária para o cartão: reduzem o saldo da conta e o restante da fatura, sem criar uma segunda despesa.

A regra dos indicadores é por competência: despesas bancárias e em dinheiro contam na data em que foram pagas; parcelas de compras itemizadas contam no mês de vencimento; faturas manuais contam pelo mês de referência. Previsões ficam fora dos gastos e do saldo atual. Uma fatura manual não é aceita para a mesma competência de uma fatura que já veio de compras itemizadas no cartão, evitando somar os mesmos gastos duas vezes.

Compras itemizadas na data de fechamento pertencem à fatura corrente. Depois dessa data, entram na seguinte. Se o vencimento for igual ou anterior ao fechamento, o vencimento será no mês seguinte. Dias inexistentes usam o último dia do mês. A diferença de centavos fica na última parcela. As faturas seguem o calendário informado, sem ajuste automático por feriados ou regras específicas de emissoras.

## Ativar a casa compartilhada

A implementação já está conectada neste workspace ao projeto próprio. Os passos abaixo servem para uma instalação em outro projeto. O projeto Help Desk não foi alterado.

1. Crie um projeto dedicado ao MB Finanças.
2. Execute supabase/setup.sql uma única vez no SQL Editor desse projeto novo. Em seguida, aplique os arquivos SQL de `supabase/migrations` na ordem de data; eles acrescentam validação sem reescrever os registros existentes. Não execute em projeto de outro app.
3. Copie .env.example para .env.local e preencha a URL do projeto e a chave PUBLICÁVEL. Nunca coloque chaves administrativas em variáveis VITE_.
4. Em Authentication / URL Configuration, cadastre a URL do app e as URLs permitidas de retorno. Para desenvolvimento, inclua http://localhost:5173 e o padrão de retorno com os parâmetros de convite.
5. Ative e-mail/senha e configure o SMTP de autenticação para confirmação de conta e recuperação de senha.
6. Reinicie npm.cmd run dev. Crie sua conta, confirme seu e-mail e entre.
7. O modo nuvem começa com uma casa vazia. Para levar os dados locais, exporte antes de ativá-lo e depois restaure o backup na conta correta.

A segunda pessoa entra pelo convite, usando o mesmo e-mail informado. Uma conta já associada a uma casa com dados não é movida silenciosamente. O app atualiza dados remotos a cada 15 segundos e ao voltar à janela, sem assinatura Realtime. Salvamentos usam versão esperada. Se o mesmo registro for alterado na outra tela, reabra-o antes de salvar para preservar a alteração mais recente.

### Envio de convites

A função está em supabase/functions/invite-member. Ela valida a sessão e se o usuário é o criador da casa antes de usar acesso administrativo.

Configure os segredos da função no Supabase:

- APP_URL: URL pública do app (no desenvolvimento, endereço acessível pela pessoa convidada).
- RESEND_API_KEY: credencial de envio do Resend.
- EMAIL_FROM: remetente em um domínio verificado pelo provedor.

O Supabase fornece SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor. Essas credenciais não pertencem ao frontend. Publique a função invite-member com a verificação JWT de gateway desativada conforme supabase/config.toml: a própria função valida o token com auth.getUser.

O convite expira em sete dias e confere o e-mail confirmado de quem aceita. O máximo é de dois membros por casa. O envio de e-mail não foi executado neste ambiente; depende desses segredos e do domínio remetente.

## Verificação

    npm.cmd run build
    npm.cmd test
    npm.cmd run test:e2e

Os testes de navegador usam Chromium e iniciam uma instância isolada do app na porta 5188. Os testes não usam os dados do navegador pessoal.

## Estrutura

- src/domain.ts: tipos, centavos, calendário de recorrências, saldo, faturas e validação do documento.
- src/App.tsx: autenticação, persistência local e compartilhada.
- src/FinanceHome.tsx: página principal, listas, filtros e operações financeiras.
- src/components: formulários específicos de conta, movimentação, recorrência e fatura.
- src/lib/supabase.ts: cliente opcional da nuvem.
- supabase/setup.sql e supabase/migrations: esquema e validação/autorização da casa.
- supabase/functions/invite-member: envio de convites.
- tests: cálculos financeiros e fluxos de navegador.

## Armazenamento

Para a primeira implementação, o estado financeiro da casa é um documento JSON versionado no PostgreSQL. Membros e convites são relacionais e protegidos por RLS; mudanças no documento usam uma função que valida a participação na casa e a versão anterior.

Essa escolha simplifica o MVP para duas pessoas. O modelo conceitual da arquitetura continua válido, mas suas entidades financeiras ficam dentro do documento por enquanto. Uma evolução para tabelas financeiras normalizadas será necessária para grandes volumes e relatórios SQL avançados. Limite de arquivo: 5 MB. O RPC aplica controle de versão otimista e autorização da casa; a migração de planejamento também confere a forma das novas coleções. RLS e funções SQL foram validados no projeto dedicado. O cadastro/login com contas reais e a entrega dos e-mails ainda precisam de verificação após configurar o remetente.

A auditoria de dependências de produção não encontrou vulnerabilidades na implementação. Avisos das ferramentas de desenvolvimento devem ser acompanhados nas atualizações.
