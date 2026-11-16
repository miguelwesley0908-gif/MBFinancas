# Arquitetura inicial — MB Finanças

**Status:** MVP implementado, banco Supabase criado e conectado; autorização remota verificada. Entrega de e-mails e publicação do frontend pendentes.
**Objetivo:** criar um app web de finanças compartilhadas para Miguel e Bia, aprendendo os fundamentos no caminho.

## Tecnologias e estilo

- **Interface:** React, TypeScript e Vite, em uma aplicação web responsiva.
- **Autenticação e banco:** Supabase Auth e PostgreSQL. Uma Supabase Edge Function cuidará do convite por e-mail, que exige uma operação privilegiada no servidor.
- **Arquitetura:** monólito modular organizado por funcionalidades; sem microsserviços.
- **Segurança:** os dados pertencem a uma casa compartilhada. As tabelas financeiras terão políticas RLS para limitar o acesso aos membros dessa casa. Chaves administrativas ficam apenas no lado servidor, nunca no navegador.
- **Dinheiro:** valores armazenados como centavos inteiros, por exemplo, R$ 25,90 como 2590.
- **Entrada de dados:** manual no MVP. Integrações bancárias e importação de extratos ficam para depois.

## Regras do produto

### Acesso e casa compartilhada

- Miguel e Bia terão contas separadas, com login por e-mail e senha.
- O segundo membro entra na casa por convite enviado por e-mail.
- Todos os dados financeiros são compartilhados pelos dois.
- O campo created_by guarda internamente quem cadastrou um item; não será usado para separar gastos ou relatórios por pessoa.

### Renda, orçamento e alertas

- O casal informa e atualiza manualmente a renda líquida média mensal conjunta.
- As receitas reais também podem ser registradas como lançamentos; a média informada é a base do orçamento no MVP.
- O app calcula os valores de referência a partir da renda média:
  - **50% — Necessidades:** categorias de gastos essenciais.
  - **30% — Desejos:** categorias de gastos não essenciais.
  - **20% — Futuro financeiro:** poupança, investimentos e dívidas.
- O casal pode criar categorias e associar cada uma a um desses três grupos.
- O resumo mostra alerta no próprio app ao atingir 80% do valor de referência de um grupo e outro alerta quando os gastos ultrapassarem 100%.
- Esses percentuais são a regra escolhida pelo casal e uma referência do app; não são uma recomendação individual de investimento.

### Despesas e cartão de crédito

- Uma despesa é contabilizada no mês em que a compra aconteceu, inclusive quando paga com cartão.
- Cada cartão guarda nome, dia de fechamento e dia de vencimento. O limite do cartão não será acompanhado.
- Compras feitas após o fechamento entram na fatura seguinte.
- Uma compra parcelada aparece pelo valor total no mês da compra. Cada parcela também aparece na previsão da fatura em que deverá ser paga.
- Exemplo: uma compra de R$ 600 em 3 vezes representa R$ 600 de gasto no mês da compra e parcelas de R$ 200 nas três faturas correspondentes.
- Os gastos e as faturas futuras são visões separadas; parcelas futuras não são somadas novamente ao total de gastos do mês.
- Pagar a fatura é uma transferência da conta bancária para o cartão, não uma nova despesa.

## Escopo do primeiro MVP

- Criar uma casa compartilhada e permitir o acesso dos dois membros.
- Registrar renda, despesas e transferências manualmente.
- Cadastrar contas bancárias, dinheiro em espécie e cartões.
- Cadastrar categorias personalizáveis nos grupos da regra 50/30/20.
- Registrar compras à vista e parceladas no cartão.
- Consultar resumo mensal de receitas e gastos, alertas de orçamento e faturas futuras.
- Registrar o pagamento de uma fatura sem duplicar despesas.

## Fora do primeiro MVP

- Conexão direta com bancos ou importação automática de extratos.
- Aplicativos nativos para iOS ou Android.
- Acompanhamento de carteira, rentabilidade ou recomendações de investimentos. É possível registrar valores destinados a investimentos no grupo “Futuro financeiro”.
- Limite disponível do cartão, despesas recorrentes automáticas, alertas por push ou divisão de uma compra em várias categorias.
- Microsserviços ou infraestrutura própria de backend.

## Modelo de dados inicial

- **households:** casa compartilhada e renda líquida média mensal conjunta informada pelo casal.
- **household_members:** associação entre as contas de usuário e a casa.
- **household_invitations:** convites pendentes por e-mail, associados à casa e consumidos quando a pessoa aceita.
- **accounts:** contas bancárias, dinheiro em espécie e cartões; cartões também guardam dia de fechamento e dia de vencimento.
- **categories:** nome da categoria, tipo (receita ou despesa) e grupo do orçamento, quando for uma despesa.
- **transactions:** receita, despesa ou transferência; guarda casa, valor em centavos, data, conta, categoria quando aplicável, descrição opcional e created_by.
  - Receita e despesa usam uma conta.
  - Transferência usa conta de origem e conta de destino; pagamento de fatura não entra nos totais de despesa.
- **card_installments:** parcelas ligadas à compra original, com número da parcela, valor em centavos e vencimento da fatura.
- **Orçamento:** os valores 50/30/20 são calculados a partir da renda média e dos grupos das categorias; não precisam de uma tabela própria no MVP.
- **Faturas:** o total previsto é calculado agrupando as parcelas pelo cartão e vencimento. Os pagamentos são transferências para o cartão.

## Organização sugerida do frontend

    src/
      app/                 inicialização, rotas e layout
      features/
        household/         casa e membros
        accounts/          contas e cartões
        categories/        categorias
        transactions/      receitas, despesas e transferências
        budgets/           orçamento e alertas
      lib/                 cliente Supabase, validação e utilitários

As regras de acesso ficam protegidas no banco com RLS; esconder uma tela no frontend não substitui autorização.

## Sequência para construir e estudar

1. Configurar um projeto Supabase e conectar o app usando variáveis locais.
2. Criar as tabelas e políticas RLS para casa e membros.
3. Implementar cadastro e login, criação da casa e convite do segundo membro por Edge Function.
4. Implementar contas, categorias, renda média e o fluxo de receitas, despesas e transferências.
5. Implementar compras parceladas, faturas futuras e pagamento de fatura.
6. Implementar resumo mensal, cálculo 50/30/20 e alertas.

## Estado atual da implementação

O aplicativo possui seis áreas funcionais: visão geral, movimentações, contas/cartões, faturas, planejamento e configurações. No modo local, salva os dados no navegador e oferece exportação/restauração de backups. Os cálculos de parcelas, saldos e orçamento são implementados em src/domain.ts.

Login, criação de conta, recuperação de senha, vínculo à casa por convite e sincronização estão escritos para Supabase. O projeto dedicado klrjbrfwjjqtqdeqhltm foi criado, o esquema aplicado e a Edge Function publicada. Autorização, compartilhamento no banco e conflitos de versão foram verificados em uma transação desfeita ao final. Faltam configurar SMTP, segredos de envio de convites e URL pública do frontend; cadastro e entrega de e-mails reais ainda não foram testados.

### Decisão de persistência desta implementação

As entidades financeiras acima são o modelo conceitual. Nesta primeira implementação, contas, categorias, renda média, lançamentos e parcelas são gravados como um documento JSON da casa, com controle de versão no PostgreSQL. Membros e convites usam tabelas relacionais e RLS. Isso permite salvamento atômico e rejeição de alterações concorrentes sem precisar coordenar várias gravações do navegador.

O salvamento remoto usa save_household, que confere participação e versão esperada. Somente usuários associados podem ler a casa. O papel administrativo nunca é enviado ao navegador. Convites conferem o e-mail confirmado e expiram em sete dias.

Esta escolha atende ao volume inicial de duas pessoas. Normalização das entidades financeiras fica como evolução para relatórios SQL e maior volume; não deve ser confundida com tabelas já criadas. O modo local não oferece compartilhamento entre dispositivos.

### Convenções implementadas

- Compra no dia do fechamento entra na fatura corrente; após esse dia, na seguinte.
- Vencimento igual ou anterior ao fechamento ocorre no mês seguinte.
- Datas impossíveis usam o último dia do mês; centavos restantes vão para a última parcela.
- Parcelas guardam seus vencimentos; a soma precisa ser igual ao valor da compra.
- Pagamentos referenciam a fatura por cartão e vencimento e não podem exceder o saldo devido.
- Compras com pagamentos vinculados só podem ser alteradas/excluídas depois da remoção desses pagamentos.
- O orçamento usa compras integrais; a previsão de caixa usa parcelas, sem somar as duas visões.
- Alteração da renda média atual recalcula as referências exibidas, inclusive ao consultar meses anteriores.
- Transferências entre contas não entram nos grupos de orçamento. Aportes a investimentos externos podem ser registrados na categoria Futuro financeiro.

Consulte README.md para execução e ativação da nuvem.
