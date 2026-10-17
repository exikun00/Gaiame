import axios from 'axios';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

async function testDownload() {
  console.log('🚀 Iniciando prueba de descarga real con motor blindado...');

  // 1. Obtener detalles de un anime para asegurar que sus episodios están en la base de datos
  console.log('Consultando detalles de kyoufu-collector...');
  const detail_res = await axios.get('http://localhost:3000/api/anime/kyoufu-collector');
  const seasons = detail_res.data.seasons || [];
  const episodes = seasons[0]?.episodes || [];
  console.log('Anime obtenido:', detail_res.data.title, 'Episodios encontrados:', episodes.length);

  const ep = episodes[0];
  if (!ep) {
    console.error('No se encontró episodio');
    process.exit(1);
  }

  console.log(`Encolando descarga para Episodio ${ep.number} (ID: ${ep.id})...`);
  const queue_res = await axios.post(`http://localhost:3000/api/downloads/episode/${ep.id}`);
  console.log('Tarea creada:', queue_res.data);
  const task_id = queue_res.data.task_id;

  // 2. Monitorear progreso de la descarga hasta completar
  let completed = false;
  let attempts = 0;
  while (!completed && attempts < 60) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;

    const status_res = await axios.get('http://localhost:3000/api/downloads/tasks');
    const task = (status_res.data.tasks || []).find(t => t.id === task_id);
    if (!task) {
      console.log('Esperando tarea...');
      continue;
    }

    console.log(`[${attempts * 2}s] Servidor: ${task.currentServer || 'N/A'} | Estado: ${task.status} | Progreso: ${task.progress}% | Error: ${task.errorMessage || 'ninguno'}`);

    if (task.status === 'COMPLETED') {
      completed = true;
      break;
    }
    if (task.status === 'FAILED') {
      console.error('✘ Descarga falló con error:', task.errorMessage);
      process.exit(1);
    }
  }

  if (!completed) {
    console.error('Timeout esperando finalización de descarga');
    process.exit(1);
  }

  // 3. Verificar el archivo final en disco con ffprobe
  const ep_res = await axios.get(`http://localhost:3000/api/anime/kyoufu-collector`);
  const finished_ep = ep_res.data.seasons[0].episodes.find(e => e.id === ep.id);
  console.log('Episodio en DB:', {
    downloadStatus: finished_ep.downloadStatus,
    filePath: finished_ep.filePath,
    fileSizeBytes: finished_ep.fileSizeBytes,
    usedServer: finished_ep.usedServer
  });

  const full_path = `./data/${finished_ep.filePath}`;
  console.log('Verificando archivo en disco:', full_path);
  if (!fs.existsSync(full_path)) {
    console.error(`Archivo no existe en ${full_path}`);
    process.exit(1);
  }

  const stat = fs.statSync(full_path);
  console.log(`Tamaño real en disco: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);

  const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height',
    '-of', 'json',
    full_path
  ]);

  const probe = JSON.parse(stdout);
  console.log('✔ Resultado ffprobe del archivo descargado:', probe);
  if (probe.streams?.[0]?.codec_name) {
    console.log(`✔ DESCARGA 100% EXITOSA Y VALIDADA CON FFPROBE (Codec: ${probe.streams[0].codec_name}, Res: ${probe.streams[0].width}x${probe.streams[0].height})`);
  } else {
    console.error('ffprobe no detectó stream de video en el archivo final');
    process.exit(1);
  }
}

testDownload().catch(e => {
  console.error('Error in testDownload:', e);
  process.exit(1);
});
