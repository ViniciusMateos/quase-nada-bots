# Guia — pegar a senha de app do Gmail (pro Claude do navegador)

Cole o bloco abaixo pro **Claude do navegador** (Claude in Chrome / built-in browser). Ele age no
seu Chrome logado, então faz o corre na sua conta Google. No fim ele te devolve a senha de app de
16 letras — é isso que vai no campo **"App password do Gmail"** do bot Criar Conta.

> Pré-requisito: a conta precisa ter **verificação em 2 etapas (2FA)** ligada. Sem isso, o Google
> nem mostra a opção de senha de app. O guia cobre esse caso (manda ligar antes).

---

## Prompt pra colar no Claude do navegador

```
Preciso gerar uma SENHA DE APP do Google (app password) e deixar o IMAP ligado na minha conta
Gmail que já está logada neste Chrome. Faça assim, me avisando se travar em algum passo:

1. Abra https://myaccount.google.com/apppasswords numa aba nova.
   - Se pedir pra confirmar a senha da conta, pare e me avise (eu digito).
   - Se aparecer "A senha de app não está disponível" ou algo dizendo que falta a verificação
     em 2 etapas: abra https://myaccount.google.com/signinoptions/twosv , me avise que preciso
     ligar o 2FA, e espere eu confirmar que liguei antes de continuar.

2. Na tela de senhas de app, no campo de nome do app, escreva: Quase Nada Bots
   Clique em "Criar" (ou "Gerar").

3. O Google vai mostrar uma senha de 16 letras (em 4 blocos de 4, tipo "abcd efgh ijkl mnop").
   COPIE essa senha e me mande ela aqui no chat, exatamente como apareceu. Depois clique em
   "Concluído".

4. Agora ligue o IMAP: abra https://mail.google.com/mail/u/0/#settings/fwdandpop
   - Na seção "Acesso IMAP", marque "Ativar IMAP".
   - Role até o fim e clique em "Salvar alterações".
   - Me confirme que o IMAP ficou ativado.

Importante: NÃO poste a senha em nenhum site nem formulário — só me devolva ela aqui no chat.
```

---

## Depois que ele te der a senha

1. Abre o bot **Criar Conta** no app (http://127.0.0.1:8777 → card "Criar Conta").
2. Põe seu Gmail no campo **Email base** e cola a senha de 16 letras em **App password do Gmail**.
3. Aparece "Código automático ligado" em verde → pronto, o bot passa a pegar o código do email
   sozinho.

A senha de app fica salva só na sua máquina (`painel-sessao/gmail_config.json`, fora do git).
Se quiser revogar depois, é na mesma página `myaccount.google.com/apppasswords` (botão de lixeira).
