# Organizador de Cargas – Fila de Prioridade

Sistema web para controle, organização e priorização de cargas montadas e separadas fisicamente na empresa.

Os dados ficam salvos no **Supabase (PostgreSQL na nuvem)**, portanto os romaneios cadastrados em um computador aparecem em qualquer outro computador que acesse o sistema.

## Como executar

```bash
npm install
npm start
```

O servidor inicia em `http://localhost:3000`.

- Backend: Node.js + Express
- Banco de dados: **Supabase / PostgreSQL na nuvem** (API REST PostgREST)
- Frontend: HTML / CSS / JavaScript (SPA)

## Configuração do banco (Supabase)

Crie um arquivo `.env` na raiz do projeto (use o `.env.example` como modelo):

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

> **Segurança:** a chave `service_role` ignora o RLS e dá acesso total ao banco. Ela é usada **apenas no servidor** e nunca é enviada ao navegador. Não publique o `.env` (ele já está no `.gitignore`). Se a chave vazar, gere uma nova no painel do Supabase.

### Tabelas usadas

| Tabela | Função |
|---|---|
| `cargas` | Romaneios cadastrados (número, data do pedido, tipo de veículo, status, observações, datas de criação/atualização/despacho) |
| `historico` | Histórico de alterações de cada carga |
| `config` | Configurações internas |
| `usuarios` | Reservada para a futura gestão de usuários |

O RLS está habilitado nas tabelas — o acesso anônimo é bloqueado; somente o backend com a `service_role` consegue ler e gravar.

## Acesso de outro computador

Há duas formas:

1. **Mesma rede local:** com o servidor rodando, o console exibe o endereço `http://IP-da-maquina:3000`. Basta abrir esse endereço no navegador do outro computador (o firewall do Windows precisa permitir a porta 3000).
2. **Outra rede / internet:** publique o projeto na Vercel (recomendado, instruções abaixo) ou em outro serviço usando as mesmas variáveis do `.env`. Como o banco está no Supabase, os dados são os mesmos em qualquer instalação.

## Deploy na Vercel

O projeto já está preparado para a Vercel:

- `api/[...path].js` — função serverless que executa o backend Express em todas as rotas `/api/*`.
- `vercel.json` — publica os arquivos estáticos de `public/` e define a duração máxima da função.
- `server.js` — exporta o app Express e só inicia o `listen` quando executado localmente (`npm start`).

Passos:

1. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório `EVERTON100792/ORGANIZADOR-DE-CARGAS-`.
2. Em **Environment Variables**, adicione (para Production, Preview e Development):
   - `SUPABASE_URL` = `https://jpafrighyyhfyvveqipm.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = sua chave service_role
3. Clique em **Deploy**. Não é necessário build; a Vercel detecta a pasta `api/` e os estáticos em `public/`.
4. O sistema ficará disponível em `https://<nome-do-projeto>.vercel.app`.

> Sempre que alterar variáveis de ambiente na Vercel, faça um novo deploy para aplicá-las. A chave `service_role` fica somente no servidor (variável de ambiente), nunca no navegador.

## Funcionalidades

### 1. Cadastro de cargas
- Cadastro de número do romaneio, data do pedido, tipo de veículo, observações e status.
- Tipo de veículo: Van, Fiorino, Três Quartos ou Toco.
- Status: A contratar ou Despachada.
- Edição e exclusão de registros.
- Alteração de status.
- Campos de cliente, número de separação/trailer e data de montagem não fazem parte do cadastro.

### 2. Ordenação automática por prioridade
- A fila é calculada automaticamente pela data do pedido mais antiga (crescente).
- Em caso de empate, o número do romaneio é usado como critério secundário.
- Despachadas saem da fila ativa, mas permanecem no histórico.

### 2.1 Consulta rápida de romaneio
- Barra de pesquisa no topo do sistema.
- Ao informar o número, o sistema avisa se já está cadastrado e mostra o status atual (A contratar ou Despachada).
- Se não existir, oferece o botão "Cadastrar agora" com o número já preenchido, evitando cadastros duplicados.

### 2.2 Sequência de montagem para expedição
- Selecione uma quantidade de cargas (ex.: as 10 primeiras da fila) ou marque individualmente com os checkboxes.
- As cargas selecionadas são impressas na mesma ordem de prioridade da fila e renumeradas de 1º a N.
- O relatório usa o mesmo layout A4, com o título "SEQUÊNCIA DE MONTAGEM – EXPEDIÇÃO".
- A seleção não altera o status: as cargas continuam "A contratar" até serem despachadas.

### 3. Painel principal – Fila de prioridade
- Colunas: Seleção, Posição, Nº Romaneio, Veículo, Data do Pedido, Observações, Status.
- Seleção de cargas para a sequência de montagem da expedição.
- Cores: vermelho (1º), laranja (2º), amarelo (3º), verde (demais).
- Cards de estatísticas: cargas na fila, prioridade #1, despachadas, total.

### 4. Gerenciamento de romaneios
- Visualizar, adicionar, editar, excluir, alterar status.
- Consultar histórico de alterações por romaneio.

### 5. Impressão de relatório para gerência
- Botão destacado "IMPRIMIR FILA DE PRIORIDADE".
- Relatório formal sem nomes e sem logotipo: cabeçalho com borda dupla, título, data/hora de emissão, tabela listrada da fila (com posição, romaneio, veículo, data do pedido, observações e status), destaque em negrito dos 3 primeiros e rodapé centralizado.
- Versão otimizada para impressão em A4 (`@page size: A4`), sem menus/botões da interface.

### 6. Filtros e pesquisa
- Por número do romaneio, período/data do pedido, status e mês/ano.

### 7. Histórico de cargas despachadas
- Lista de despachadas com data de despacho e histórico de alterações.

### 8. Design
- Visual corporativo premium em azul-marinho e dourado, responsivo (desktop, tablet, celular).
- Interface sem logotipo, conforme solicitado.

## API REST

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/fila` | Fila de prioridade ativa com posições |
| GET | `/api/verificar-romaneio` | Consulta se um romaneio já existe e informa o status |
| GET | `/api/relatorio` | Dados para o relatório de impressão |
| GET | `/api/despachados` | Romaneios despachados + histórico |
| GET | `/api/cargas` | Listagem com filtros (`numero`, `dataInicio`, `dataFim`, `status`, `periodo`) |
| POST | `/api/cargas` | Cadastrar carga |
| PUT | `/api/cargas/:id` | Editar carga |
| PATCH | `/api/cargas/:id/status` | Alterar status |
| DELETE | `/api/cargas/:id` | Excluir carga |
| GET | `/api/cargas/:id/historico` | Histórico de alterações |
| GET | `/api/historico` | Histórico geral |
| GET/PUT | `/api/config` | Configurações internas |

## Estrutura

```
server.js                  # API REST + servidor + cliente Supabase (exporta o app)
api/[...path].js           # Função serverless da Vercel (/api/*)
vercel.json                # Configuração de deploy (estáticos + função)
public/index.html          # Interface
public/css/style.css       # Estilos (incl. versão de impressão)
public/js/app.js           # Lógica da interface
public/js/report.js        # Montagem do relatório de impressão
.env                       # Credenciais do Supabase (não versionar)
.env.example               # Modelo de configuração
```

## Próximas evoluções

- Gestão de usuários e permissões.
- Autenticação e perfis de acesso.
