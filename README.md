# lpm

看本机在跑什么项目、占了哪些端口；扫出本机所有 electron / tauri / web 项目；一条命令在后台启动、停止、重启某个项目。

零运行时依赖的命令行工具。

```
$ lpm

运行中 3 个项目 · 12 个端口

  ● deepseek-harness  node
    ~/Code/deepseek-harness
    :3080   node --import tsx/esm apps/cli/src/bin.ts web

  ● content-bench  web
    ~/Code/github/ywleeo/content-bench
    :5181 :5182  2 个进程
    node .../content-bench/node_modules/.bin/vite

另有 11 个非项目端口  :5000 ControlCenter  :14013 WeChat …
用 lpm -a 查看全部
```

```
$ lpm scan -k tauri,electron

~/Code  ·  4 个项目

  electron (2)
    bterm          ~/Code/github/ywleeo/bterm                npm run dev
    mark2          ~/Code/Archive/mark2                      npm run dev

  tauri (2)
    mark2-tauri    ~/Code/github/ywleeo/mark2s/mark2-tauri   npm run tauri:dev
    robin          ~/Code/github/ywleeo/robin                pnpm tauri dev
```

## 安装

需要 Node.js 18+，只支持 macOS / Linux（依赖系统自带的 `lsof` 和 `ps`）。

```bash
git clone https://github.com/ywleeo/gitapp.git
cd gitapp
npm install
npm run build
```

然后把 `dist/cli.js` 放进 PATH，任选一种：

```bash
npm link                                        # npm 全局目录可写时
ln -sf "$PWD/dist/cli.js" ~/.local/bin/lpm      # 不想碰 npm 全局目录时
```

## 用法

| 命令 | 作用 |
|---|---|
| `lpm` | 列出正在监听的端口，反查是哪个项目在跑 |
| `lpm -a` | 连系统服务、GUI 应用（微信、Clash 等）的端口一起列 |
| `lpm scan` | 扫描本机项目，● 标出正在运行的 |
| `lpm scan -k electron,tauri,web` | 只看指定类型 |
| `lpm scan -r ~/work -r ~/side` | 指定扫描目录，可重复 |
| `lpm scan -d 6` | 递归深度，默认 4 |
| `--json` | 两个命令都支持，输出 JSON 方便接脚本 |

`lpm scan` 不加 `-r` 时，会扫 home 下存在的 `Code` `Projects` `Developer` `Work` `src` `repos` `workspace`。

### 启动 / 停止 / 重启

| 命令 | 作用 |
|---|---|
| `lpm start robin` | 在后台启动，lpm 立即返回 |
| `lpm stop robin` | 停止 |
| `lpm restart robin` | 先停再起 |
| `lpm logs robin -f` | 跟踪日志，`-n 200` 看最后 200 行 |
| `lpm start robin --cmd "pnpm dev"` | 不用推断的命令，改用指定的；之后 restart 会沿用这条 |

项目可以写目录名、唯一前缀（`rob`）或路径；不写就是当前目录。名字匹配到多个时会列出来让你选，不会自己猜。

- **后台运行**：项目跑在独立进程组里，关掉终端也不受影响。输出写到 `~/.lpm/logs/`，状态记在 `~/.lpm/run/`（可以用 `LPM_HOME` 改位置）
- **启动失败当场报**：拉起后观察 1.5 秒，进程退出了就直接打印最后 20 行日志
- **能停外部启动的项目**：你在别的终端手动 `npm run dev` 起的也能停和重启。lpm 从占用端口的进程往上找到真正的启动者（npm / pnpm / node / python / cargo …），连同子进程一起停掉。往上找的时候碰到 shell、编辑器或者不认识的进程就停下，也不会走出项目目录，所以不会把你的终端或 IDE 杀掉
- **先礼后兵**：先发 SIGTERM，5 秒后还没退出的再发 SIGKILL

## 怎么做到的

**端口 → 项目**

```
lsof -iTCP -sTCP:LISTEN   拿到所有监听端口和 pid
lsof -p <pid> -d cwd      拿到进程工作目录
向上找 package.json / pyproject.toml / Cargo.toml / go.mod / .git   定位项目根
```

全程不需要 sudo。拿不到工作目录的进程（权限、系统进程）归到「非项目端口」。

**识别项目类型**

| 类型 | 判断依据 |
|---|---|
| tauri | 有 `src-tauri/tauri.conf.json` |
| electron | 依赖里有 electron / electron-vite / electron-builder / electron-forge |
| web | 依赖里有 vite / next / nuxt / react / vue / svelte / astro 等 |
| node | 其余带 scripts 的 package.json |
| python / rust / go | pyproject.toml / Cargo.toml / go.mod |

项目名用目录名，不用 package.json 里的 `name`，因为那个往往是发布用的包名，跟你记住的项目名对不上。

**启动命令**

- 包管理器看 lockfile：pnpm / yarn / bun / npm
- 普通项目按 `dev` > `start` > `serve` > `preview` 挑脚本
- tauri 项目的 `dev` 通常只起前端，所以改为 `tauri:dev` 脚本 > `tauri dev` > `cargo tauri dev`

## 开发

```bash
npm run dev        # tsc --watch
npm run typecheck
```

源码在 `src/`：

```
cli.ts        参数解析、ports / scan 输出
manage.ts     start / stop / restart / logs 命令
control.ts    启停逻辑：后台拉起、找启动者、停进程树
resolve.ts    项目名 / 路径 → 项目
ports.ts      端口扫描，按项目聚合
projects.ts   磁盘扫描
detect.ts     项目根定位、类型识别、启动命令推断
proc.ts       进程表、cwd、信号
state.ts      ~/.lpm 下的托管状态和日志路径
format.ts     颜色、中文宽度对齐
types.ts
```
