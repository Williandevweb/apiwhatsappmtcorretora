
// ---------- BIBLIOTECAS UTILIZADAS PARA COMPOSIÇÃO DA API ---------------- //
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const mysql = require('mysql2/promise');
const http = require('http');
const fileUpload = require('express-fileupload');
const app = express();
const fs = require('fs');
const server = http.createServer(app);
const io = socketIO(server);
const path = require('path');

// ---------- PORTA ONDE O SERVIÇO SERÁ INICIADO ---------------- //
const port = 8006;

const idClient = "mtcorretora";

// ----------  SERVIÇO EXPRESS ---------------- //
// SERVIÇO EXPRESS
app.use(express.json());
app.use(express.urlencoded({
extended: true
}));
app.use(fileUpload({
debug: true
}));
app.use("/", express.static(__dirname + "/"))
app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

// Conexão com servidor banco de dados
const createConnection = async () => {
	return await mysql.createConnection({
		host: '191.252.143.38',
		user: 'alavanca_corremt',
		password: 'eLwyUOzn_oYj',
		database: 'alavanca_mtcorretora'   
	});
}

// ---------- PARÂMETROS DO CLIENT DO WHATSAPP ---------------- //
const client = new Client({
  authStrategy: new LocalAuth({ clientId: idClient }),
  puppeteer: {
  // CAMINHO DO CHROME PARA WINDOWS (REMOVER O COMENTÁRIO ABAIXO)
  //executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  //===================================================================================
  // CAMINHO DO CHROME PARA MAC (REMOVER O COMENTÁRIO ABAIXO)
  //executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  //===================================================================================
  // CAMINHO DO CHROME PARA LINUX (REMOVER O COMENTÁRIO ABAIXO)
  //executablePath: '/usr/bin/google-chrome-stable',
  //===================================================================================
	args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ]
  },
   webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2407.3.html',
            },
    
});


// INITIALIZE DO CLIENT DO WPP
client.initialize();

//EVENTOS DE CONEXÃO EXPORTADOS PARA O INDEX.HTML VIA SOCKET
io.on('connection', function(socket) {
  socket.emit('message', 'ChatBot - Iniciado');
  socket.emit('qr', './icon.gif');

  client.on('qr', (qr) => {
      console.log('QR RECEIVED', qr);
      qrcode.toDataURL(qr, (err, url) => {
        socket.emit('qr', url);
        socket.emit('message', 'ChatBot QRCode recebido, aponte a câmera  seu celular!');
      });
  });

  client.on('ready', () => {
      socket.emit('ready', 'ChatBot Dispositivo pronto!');
      socket.emit('message', 'ChatBot Dispositivo pronto!');
      socket.emit('qr', './check.svg')	
      console.log('ChatBot Dispositivo pronto');
  });

  client.on('authenticated', () => {
      socket.emit('authenticated', 'ChatBot Autenticado!');
      socket.emit('message', 'ChatBot Autenticado!');
      console.log('ChatBot Autenticado');
  });

  client.on('auth_failure', function() {
      socket.emit('message', 'ChatBot Falha na autenticação, reiniciando...');
      console.error('ChatBot Falha na autenticação');
  });

  client.on('change_state', state => {
    console.log('ChatBot Status de conexão: ', state );
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'ChatBot Cliente desconectado!');
    console.log('ChatBot Cliente desconectado', reason);
    client.initialize();
  });
});

// Update data ultima interação tabela clientes banco de dados
const createCliente = async (nome,telefone,cpf,procurando) => {

  const connection = await createConnection();
  const dataAtual = new Date().toISOString();

  try {
    const sql = `INSERT INTO clientes (nome,telefone,data_saudacao,data_ausencia,cpf,informe_procurando) VALUES (?, ?, ?, ?, ?,?)`;
    
    const values = [nome, telefone, dataAtual, dataAtual, cpf, procurando];
    const [rows] = await connection.execute(sql, values);

    if (rows.length > 0) {
        return rows;
    } else {
        return false;
    }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return false;
  } finally {
      connection.end();
  }
};

// Update data ultima interação tabela clientes banco de dados
const UpdateultimaInteracao = async (telefone, campo) => {
  const connection = await createConnection();
  const dataAtual = new Date().toISOString();

  try {
    const [rows] = await connection.execute(`UPDATE clientes SET ${campo} = ? WHERE telefone = ?`, [dataAtual, telefone]);

    if (rows.length > 0) {
        return rows;
    } else {
        return false;
    }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return false;
  } finally {
      connection.end();
  }
};

// Update se envio mensagem solicitando o CPF clientes banco de dados
const UpdateCpfProcurando = async (telefone, cpf,procurando) => {
  const connection = await createConnection();

  try {
    const [rows] = await connection.execute(`UPDATE clientes SET cpf = ?, informe_procurando = ? WHERE telefone = ?`, [cpf, procurando, telefone]);

    if (rows.length > 0) {
        return rows;
    } else {
        return false;
    }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return false;
  } finally {
      connection.end();
  }
};

// Get clientes banco de dados
const clientes = async (telefone, campo) => {
  const connection = await createConnection();

  try {
      const [rows] = await connection.execute(`SELECT ${campo} FROM clientes WHERE telefone = ?`, [telefone]);

      if (rows.length > 0) {
          return rows;
      } else {
          return false;
      }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return false;
  } finally {
      connection.end();
  }
};


// Obter periodo do dia
function obterSaudacao() {
  const agora = new Date();
  const hora = agora.getHours();

  if (hora >= 5 && hora < 12) {
    return 'Bom dia';
  } else if (hora >= 12 && hora < 18) {
    return 'Boa tarde';
  } else if (hora >= 18 && hora < 24) {
    return 'Boa noite';
  } else {
    return 'Boa madrugada';
  }
}

async function calculaDia(data){

  // Obtém a data atual
  var dataAtual = new Date();

  // Converte a string para um objeto de data JavaScript
  var dataSaudacao = new Date(data);

  // Compara apenas o dia, mês e ano
  var mesmoDia = dataAtual.getDate() === dataSaudacao.getDate() &&
                 dataAtual.getMonth() === dataSaudacao.getMonth() &&
                 dataAtual.getFullYear() === dataSaudacao.getFullYear();

  if (mesmoDia) {
      return true;
  } else {
      // Calcula a diferença em milissegundos
      var diferencaEmMilissegundos = Math.abs(dataAtual - dataSaudacao);

      // Converte a diferença para dias
      var diferencaEmDias = Math.ceil(diferencaEmMilissegundos / (1000 * 60 * 60 * 24));

      if (diferencaEmDias >= 1) {
          return false;
      } else {
          return true;
      }
  }
}

// Função para comparar horários
function estaNoIntervalo(horário, inicio, fim) {
  // Converter horário para minutos
  let horarioMinutos = parseInt(horário.split(":")[0]) * 60 + parseInt(horário.split(":")[1]);
  let inicioMinutos = parseInt(inicio.split(":")[0]) * 60 + parseInt(inicio.split(":")[1]);
  let fimMinutos = parseInt(fim.split(":")[0]) * 60 + parseInt(fim.split(":")[1]);

  // Verificar se está dentro do intervalo
  return horarioMinutos >= inicioMinutos && horarioMinutos <= fimMinutos;
}

//Obter se o estabelecimento está aberto ou fechado
async function verificarEstabelecimento (telefone,nome){

  // Obter a data atual
  var dataAtual = new Date();

  // Array para mapear os dias da semana
  var diasDaSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

  // Obter o dia da semana (0 para Domingo, 1 para Segunda-feira, ...)
  var diaDaSemana = dataAtual.getDay();

  // Obter o nome do dia da semana
  var nomeDoDia = diasDaSemana[diaDaSemana];

  // Obter o horário atual
  var horaMinutoAtual = `${dataAtual.getHours()}:${dataAtual.getMinutes()}`;

  var mensagemSaudacao = "";
  var periodoDoDia = obterSaudacao();

  var horaInicio = "08:00";
  var horaFim = "18:00";  

  // Verificar se está dentro do intervalo
  var dentroDoIntervalo = estaNoIntervalo(horaMinutoAtual, horaInicio, horaFim);

  if(nomeDoDia == "Domingo"){

    var consultaData = await clientes(telefone, "data_ausencia");

    if(consultaData != false){
      var nomeCampoBanco = "data_ausencia";
      var dataUltimaMensagem = consultaData[0].data_ausencia;
      mensagemSaudacao = `Olá ${nome}, ${periodoDoDia}!\n\nObrigado por entrar em contato conosco.\n\nNossos horários de atendimento são: Segunda a Sexta-feira: 08:00 às 18:00 - Sábado: 08:00 às 12:00 Domingo: Não abrimos.\n\nDeixe sua mensagem, assim que possivel nossa equipe irá lhe atender`;
    }else{
      await createCliente(nome,telefone,"false","false");
      var nomeCampoBanco = "data_ausencia";
      mensagemSaudacao = `Olá ${nome}, ${periodoDoDia}!\n\nObrigado por entrar em contato conosco.\n\nNossos horários de atendimento são: Segunda a Sexta-feira: 08:00 às 18:00 - Sábado: 08:00 às 12:00 Domingo: Não abrimos.\n\nDeixe sua mensagem, assim que possivel nossa equipe irá lhe atender`;
    }

  }else if(dentroDoIntervalo == true){

    var consultaData = await clientes(telefone, "data_saudacao");

    if(consultaData != false){
      var nomeCampoBanco = "data_saudacao";
      var dataUltimaMensagem = consultaData[0].data_saudacao;
      mensagemSaudacao = `E aí ${nome}, ${periodoDoDia}!\n\nTudo certo?\n\nSeja muito bem-vindo(a) à MT CORRETORA DE SEGUROS SEGURALTA\n\nAntes de continuarmos, me diz uma coisa:\n\nVocê já é nosso cliente?\n\n[1] Sou cliente\n\n[2] Ainda não`;
    }else{
      await createCliente(nome,telefone,"false","false");
      var nomeCampoBanco = "data_saudacao";
      mensagemSaudacao = `E aí ${nome}, ${periodoDoDia}!\n\nTudo certo?\n\nSeja muito bem-vindo(a) à MT CORRETORA DE SEGUROS SEGURALTA\n\nAntes de continuarmos, me diz uma coisa:\n\nVocê já é nosso cliente?\n\n[1] Sou cliente\n\n[2] Ainda não`;
    }
  }else{

    var consultaData = await clientes(telefone, "data_ausencia");

    if(consultaData != false){
      var nomeCampoBanco = "data_ausencia";
      var dataUltimaMensagem = consultaData[0].data_ausencia;
      mensagemSaudacao = `Olá ${nome}, ${periodoDoDia}!\n\nObrigado por entrar em contato conosco.\n\nNossos horários de atendimento são: Segunda a Sexta-feira: 08:00 às 18:00 - Sábado: 08:00 às 12:00 Domingo: Não abrimos.\n\nDeixe sua mensagem, assim que possivel nossa equipe irá lhe atender`;
    }else{
      await createCliente(nome,telefone,"false","false");
      var nomeCampoBanco = "data_ausencia";
      mensagemSaudacao = `Olá ${nome}, ${periodoDoDia}!\n\nObrigado por entrar em contato conosco.\n\nNossos horários de atendimento são: Segunda a Sexta-feira: 08:00 às 18:00 - Sábado: 08:00 às 12:00 Domingo: Não abrimos.\n\nDeixe sua mensagem, assim que possivel nossa equipe irá lhe atender`;
    }
  }

  if(consultaData == false){
    var arrayFuncionamento = {
      "enviaMensagem": false,
      "mensagemSaudacaoAusencia": mensagemSaudacao,
      "nomeDoCampo": nomeCampoBanco
    };
  }else{

    var calculaDiaDiferenca = await calculaDia(dataUltimaMensagem);

    var arrayFuncionamento = {
      "enviaMensagem": calculaDiaDiferenca,
      "mensagemSaudacaoAusencia": mensagemSaudacao,
      "nomeDoCampo": nomeCampoBanco
    };
  }

  return arrayFuncionamento;
}

// Recebe e envia mensagem WhatsApp
client.on('message', async msg => {

  const contact = await msg.getContact();
  const telefone = contact.number;
  var nome = "";

  if(contact.name !== undefined){
    nome = contact.name;
  }else if(contact.pushname !== undefined){
    nome = contact.pushname;
  }else{
    nome = telefone;
  }

  if (msg.body !== null && !msg.from.includes('@g.us') && msg.type.toLocaleLowerCase() !== "ciphertext" && msg.type.toLocaleLowerCase() !== "e2e_notification" && msg.type.toLocaleLowerCase() !== ""){

    var saudacaoAusencia = await verificarEstabelecimento(telefone,nome);

    await UpdateultimaInteracao(telefone, saudacaoAusencia.nomeDoCampo);

    var solicitouCpf = await clientes(telefone, "cpf");
    var informeProcurando = await clientes(telefone, "informe_procurando");

    if(saudacaoAusencia.enviaMensagem == false){
      msg.reply(saudacaoAusencia.mensagemSaudacaoAusencia);
    }

    if(solicitouCpf[0].cpf == "true"){
      await UpdateCpfProcurando(telefone, "false", "false");
      msg.reply(`Maravilha ${nome},\n\nAgora me fala aqui como podemos te ajudar:\n3. Cotação/Renovação\n4. Endosso\n5. 2 ª Via de Boletos e Parcelas\n6. Sinistro\n7. Demais assuntos\n\n[#] Voltar ao Menu`);   
    }

    if(informeProcurando[0].informe_procurando == "true"){
      await UpdateCpfProcurando(telefone, "false", "false");
      msg.reply(`Maravilha ${nome}, aguarde um instante que um de nossos atendentes irá lhe atender!`);
    }

    if(msg.body === "1"){
      await UpdateCpfProcurando(telefone, "true", "false");
      msg.reply("Legal! Poderia me informar seu CPF?");

    }else if(msg.body === "2"){
      await UpdateCpfProcurando(telefone, "false", "true");
      msg.reply("Então me fala, em uma única mensagem, o que você está procurando. Pode digitar...");

    }else if(msg.body === "3" || msg.body === "4" || msg.body === "5" || msg.body === "6" || msg.body === "7"){
      msg.reply(`Maravilha ${nome}, aguarde um instante que um de nossos atendentes irá lhe atender!`);
    }else if(msg.body === "#"){
      msg.reply(saudacaoAusencia.mensagemSaudacaoAusencia);
    }
  }
});

// ---------- INITIALIZE DO SERVIÇO ---------------- //
server.listen(port, function() {
  console.log('Aplicativo rodando na porta *: ' + port);
});
