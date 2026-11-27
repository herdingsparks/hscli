// Exercise the real try command and Hull transport, with synthetic API metadata
// and a loopback-only SSE peer. No stored key or live inference endpoint is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, copyFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {once} from 'node:events';

const hull = process.argv[2]?.includes('/') ? resolve(process.argv[2]) : process.argv[2] ?? 'hull';
const root = await mkdtemp(join(tmpdir(), 'hscli-stream-'));
const peers = new Map();
const sockets = new Set();
const children = new Set();
const ev = value => `data: ${JSON.stringify(value)}\n\n`;
const content = text => ev({choices: [{delta: {content: text}}]});
const finish = ev({choices: [{delta: {}, finish_reason: 'stop'}]});
const usage = ev({choices: [], usage: {prompt_tokens: 3, completion_tokens: 2}});
const server = createServer((req, res) => {
    const name = req.url.slice(1);
    const peer = {closed: false, tailSent: false};
    peers.set(name, peer);
    res.on('close', () => { peer.closed = true; });
    res.writeHead(200, {'Content-Type': 'text/event-stream'});
    res.flushHeaders();
    if (name === 'complete') {
        // Deliberately split both SSE framing and a multibyte UTF-8 character.
        const bytes = Buffer.from(content('árvíz'));
        const split = bytes.indexOf(Buffer.from('á')) + 1;
        res.write(bytes.subarray(0, split));
        setTimeout(() => res.write(bytes.subarray(split)), 20);
        setTimeout(() => {
            peer.tailSent = true;
            res.write(finish + usage + 'data: [DONE]\n\n');
            // Intentionally stay open: DONE must close it, not wait for EOF.
        }, 300);
    } else if (name === 'truncated') {
        res.end(content('par'));
    } else if (name === 'finish-eof') {
        res.end(content('ok') + finish + usage);
    } else if (name === 'done-only') {
        res.write(content('ok') + 'data: [DONE]\n\n');
    } else if (name === 'provider-error') {
        res.write(content('par') + ev({error: {code: 'node_lost', message: 'synthetic failure'}}));
    } else if (name === 'disconnect') {
        res.write(content('par'));
        setTimeout(() => res.destroy(), 100);
    } else {
        // timeout / interrupt: no terminal event or EOF.
        res.write(content('waiting'));
    }
});
server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
});

try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    await mkdir(join(root, 'commands'));
    await mkdir(join(root, 'lib'));
    await copyFile(new URL('../commands/try.ts', import.meta.url), join(root, 'commands/try.ts'));
    await copyFile(new URL('../lib/types.ts', import.meta.url), join(root, 'lib/types.ts'));
    await writeFile(join(root, 'lib/api.ts'), `
import {httpClient} from 'hull:http-client';
export class HscliError extends Error {readonly rc=1;}
export function host(_:unknown){return 'synthetic';}
export function readKey(){return 'synthetic-not-a-real-key';}
export function expiryWarning(_:unknown){return null;}
export async function describe(..._:unknown[]){return {key:{expires:null,limits:{max_tokens:2048}},models:[{id:'synthetic'}]};}
export async function postStream(_env:unknown,_path:string,_key:string,doc:any,_timeout:number){
 const name=doc.messages[0].content;
 return httpClient.async.stream('POST','http://127.0.0.1:${port}/'+name,{body:'{}',timeoutMs:2000,lifeMs:name==='timeout'?200:3000});
}
export async function readAll(_:unknown){throw Error('unexpected non-200 reply');}
export function apiError(_:unknown){return 'synthetic';}
`);
    await writeFile(join(root, 'app.ts'), `
import {app} from 'hull:app';
import {tryIt} from './commands/try.ts';
app.manifest({modules:['hull/http-client@1','hull/sse-client@1'],hosts:['127.0.0.1']});
app.main(async(ctx:Hull.MainContext)=>{
 try{return await tryIt(ctx,ctx.args);}catch(e){ctx.stderr.write(String((e as Error).message)+'\\n');return 1;}
});
`);
    async function run(name, expected) {
        const child = spawn(hull, [join(root, 'app.ts'), '--', name], {stdio: ['ignore', 'pipe', 'pipe']});
        children.add(child);
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        let stdout = '', stderr = '', incremental = false, interrupted = false;
        child.stdout.on('data', data => {
            stdout += data.toString();
            if (name === 'complete' && stdout.includes('árvíz') && !peers.get(name)?.tailSent) incremental = true;
            if (name === 'interrupt' && !interrupted && stdout.includes('waiting')) {
                interrupted = true;
                child.kill('SIGINT');
            }
        });
        child.stderr.on('data', data => { stderr += data.toString(); });
        const [code, signal] = await once(child, 'exit');
        clearTimeout(timer);
        children.delete(child);
        if (name === 'interrupt') assert.ok(code === 130 || signal === 'SIGINT', `${name}: ${code}/${signal}: ${stderr}`);
        else assert.equal(code, expected, `${name}: ${stderr}`);
        for (let i = 0; i < 50 && !peers.get(name)?.closed; i++) await new Promise(r => setTimeout(r, 20));
        assert.equal(peers.get(name)?.closed, true, `${name}: peer still open`);
        if (name === 'complete') {
            assert.ok(incremental, 'output was buffered until completion');
            assert.equal(stdout, 'árvíz\n');
            assert.match(stderr, /3 tokens in, 2 tokens out/);
        }
        if (name === 'truncated') {
            assert.equal(stdout, 'par\n');
            assert.match(stderr, /stream ended before completion/);
        }
        if (name === 'provider-error') assert.match(stderr, /node_lost/);
        if (name === 'disconnect' || name === 'timeout') assert.match(stderr, /reply stopped part-way/);
        if (name === 'finish-eof') assert.match(stderr, /3 tokens in, 2 tokens out/);
        console.log(`  PASS  streaming CLI: ${name}`);
    }
    for (const name of ['complete', 'truncated', 'finish-eof', 'done-only', 'provider-error', 'disconnect', 'timeout', 'interrupt'])
        await run(name, ['truncated', 'provider-error', 'disconnect', 'timeout'].includes(name) ? 1 : 0);
} finally {
    for (const child of children) child.kill('SIGKILL');
    for (const socket of sockets) socket.destroy();
    await new Promise(r => server.close(r));
    await rm(root, {recursive: true, force: true});
}
