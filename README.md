# MB Finanças

Aplicação para organizar as finanças do casal, com contas, receitas, despesas, compras parceladas, faturas, orçamento 50/30/20 e cópias de segurança.

## Ambiente conectado

Projeto MB Finanças criado na organização Miguel Wesley, região São Paulo, com custo informado de US$ 0/mês. Painel: https://supabase.com/dashboard/project/klrjbrfwjjqtqdeqhltm

Este workspace já contém .env.local com URL e chave publicável. O esquema inicial já foi aplicado e a função invite-member está publicada. Não execute setup.sql novamente neste projeto.

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

- **Resumo** mostra os saldos, valores recebidos, gastos e faturas do período selecionado.
- **Movimentações** registra o que foi gasto, recebido ou transferido. Compras no cartão aceitam parcelas.
- **Contas** reúne contas bancárias, dinheiro e cartões. O formulário apresenta somente os campos do tipo selecionado.
- **Mais** contém faturas, orçamento e configurações. As faturas também podem ser abertas pelo resumo ou pelo cartão.
- **Orçamento** usa a renda mensal prevista e categorias cotidianas agrupadas internamente em 50/30/20. Receitas registradas continuam separadas do valor previsto para o orçamento.

Compras na data do fechamento pertencem à fatura corrente. Depois dessa data, entram na seguinte. Se o vencimento for igual ou anterior ao fechamento, o vencimento será no mês seguinte. Dias inexistentes usam o último dia do mês. A diferença de centavos fica na última parcela. As faturas seguem o calendário informado, sem ajuste automático por feriados ou regras específicas de emissoras.

## Ativar a casa compartilhada

A implementação já está conectada neste workspace ao projeto próprio. Os passos abaixo servem para uma instalação em outro projeto. O projeto Help Desk não foi alterado.

1. Crie um projeto dedicado ao MB Finanças.
2. Execute supabase/setup.sql uma única vez no SQL Editor desse projeto novo. O script cria tabelas e funções; não execute em projeto de outro app.
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

Os testes de navegador usam Microsoft Edge instalado no Windows. O Playwright inicia uma instância isolada do app na porta 5188. Os testes não usam os dados do navegador pessoal.

## Estrutura

- src/domain.ts: tipos, centavos, cálculo das parcelas, saldos, faturas e validação de backups.
- src/App.tsx: navegação, formulários e persistência.
- src/lib/supabase.ts: cliente opcional da nuvem.
- supabase/setup.sql: esquema e autorização da casa.
- supabase/functions/invite-member: envio de convites.
- tests: cálculos financeiros e fluxos de navegador.

## Armazenamento

Para a primeira implementação, o estado financeiro da casa é um documento JSON versionado no PostgreSQL. Membros e convites são relacionais e protegidos por RLS; mudanças no documento usam uma função que valida a participação na casa e a versão anterior.

Essa escolha simplifica o MVP para duas pessoas. O modelo conceitual da arquitetura continua válido, mas suas entidades financeiras ficam dentro do documento por enquanto. Uma evolução para tabelas financeiras normalizadas será necessária para grandes volumes e relatórios SQL avançados. Limite de arquivo: 5 MB. RLS e funções SQL foram validados no projeto dedicado. O cadastro/login com contas reais e a entrega dos e-mails ainda precisam de verificação após configurar o remetente.

A auditoria de dependências de produção não encontrou vulnerabilidades na implementação. Avisos das ferramentas de desenvolvimento devem ser acompanhados nas atualizações.
