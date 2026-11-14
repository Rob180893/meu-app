# Meu Quadro de Estudos (uso pessoal, offline)

Versão só para uso pessoal. Não tem login, não tem conta, não usa Firebase nem servidor.
Todos os dados ficam salvos **no próprio aparelho** (navegador). Funciona sem internet.

## 1. Gerar o arquivo (uma vez no PC)

Precisa ter o Node.js instalado (https://nodejs.org, versão LTS). Na pasta do projeto:

```
npm install
npm run build
```

O resultado é um único arquivo:

```
dist-standalone/Meu-Quadro-de-Estudos.html
```

Esse arquivo contém o app inteiro. Não precisa de servidor, nem de internet.

## 2. Levar para o tablet ou celular

Copie o arquivo `Meu-Quadro-de-Estudos.html` para o aparelho (cabo USB, Google Drive, e-mail para você mesmo, etc.).
Depois, abra o arquivo com o **Google Chrome** (ou outro navegador).

Dica: para ele ficar como um app na tela inicial, depois de aberto, use o menu do navegador > **Adicionar à tela inicial**.

## 3. Migrar os dados do app antigo (importante)

Os dados do app antigo ficam ligados ao endereço onde ele estava. O arquivo novo começa **vazio**, então:

1. No app antigo, vá no menu lateral e clique em **Exportar backup** (JSON).
2. No arquivo novo, abra o menu lateral e clique em **Importar backup**, escolhendo esse arquivo.

## Cuidados

- **Backup:** os dados ficam só neste aparelho. Exporte um backup de vez em quando (menu lateral > Exportar backup) e guarde o arquivo em algum lugar seguro.
- **Atualizações:** se mudar o código, rode `npm run build` de novo e substitua o arquivo no aparelho. Os dados continuam os mesmos, desde que o endereço de abertura seja o mesmo.
- **Limpar dados do navegador** apaga tudo. Antes de fazer isso, exporte o backup.

## Desenvolvimento

```
npm run dev      # roda no PC para testes (precisa de internet só para instalar pacotes)
npm run build    # gera o arquivo único em dist-standalone/
```
