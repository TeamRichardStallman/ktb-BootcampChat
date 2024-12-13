const cluster = require('cluster');
const os = require('os');
const { app, server } = require('./server');

const numCPUs = os.cpus().length;

if (cluster.isMaster) {
    console.log(`마스터 프로세스 ${process.pid} 실행`);

    // CPU 코어 수만큼 워커 생성
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // 워커 종료시 새로운 워커 생성
    cluster.on('exit', (worker, code, signal) => {
        console.log(`워커 ${worker.process.pid} 종료됨`);
        console.log('새로운 워커 생성');
        cluster.fork();
    });
} else {
    // 워커 프로세스에서 서버 실행
    require('./server');
    console.log(`워커 프로세스 ${process.pid} 실행`);
}
