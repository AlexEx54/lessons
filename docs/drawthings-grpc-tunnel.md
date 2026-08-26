# Draw Things gRPC tunnel

Draw Things runs on the developer Mac and listens on `127.0.0.1:7859`. The production
lesson generator runs on the VPS. A reverse SSH tunnel makes the Mac service available
to processes on the VPS at `127.0.0.1:17859` without exposing it to the Internet.

```text
Lesson generator on VPS
        |
        v
127.0.0.1:17859 on VPS
        |
        | reverse SSH tunnel
        v
127.0.0.1:7859 on Mac (Draw Things gRPC)
```

## Draw Things settings

In Draw Things, open **Settings -> Advanced -> API Server** and set:

- Server Online: enabled
- Protocol: gRPC
- Port: `7859`
- Transport Layer Security: enabled
- IP: `127.0.0.1 (localhost only)`
- Response Compression: enabled

Bridge Mode is unrelated to the SSH tunnel. Model Browsing is optional when the client
already knows the installed model filenames.

## Start the tunnel

Run this command on the Mac and leave it running:

```bash
npm run drawthings:tunnel
```

The equivalent direct command is:

```bash
bash scripts/drawthings-tunnel.sh
```

Show all configuration variables:

```bash
npm run drawthings:tunnel -- --help
```

Press `Ctrl+C` to close the tunnel. Once it closes, port `17859` disappears from the VPS.

## Configuration

The defaults match the current production VPS. Override them with environment variables:

```bash
DRAWTHINGS_VPS_HOST=144.31.76.176 \
DRAWTHINGS_VPS_SSH_PORT=4537 \
DRAWTHINGS_VPS_USER=root \
DRAWTHINGS_REMOTE_PORT=17859 \
npm run drawthings:tunnel
```

The supported variables are documented by `scripts/drawthings-tunnel.sh --help`.

Keep `DRAWTHINGS_REMOTE_HOST=127.0.0.1` unless there is a deliberate reason to expose
the port beyond the VPS itself.

## Use from the lesson generator

Code running directly on the VPS connects to:

```text
host: 127.0.0.1
port: 17859
TLS: enabled
```

Example using `drawthings-py`:

```python
import asyncio

from drawthings_py import Configs, DrawThings, RequestBuilder


async def generate_image():
    config = Configs.from_preset("qwen_image_2512_lightning")
    config["width"] = 512
    config["height"] = 512

    request = RequestBuilder(
        config,
        prompt="A bright educational illustration, no text",
        negative_prompt="low quality, blurry, text, watermark, logo",
    )

    async with DrawThings.grpc(
        host="127.0.0.1",
        port=17859,
        progressbar=False,
    ) as service:
        result = await service.generate(request)

    result[0].to_file("/tmp/lesson-image.png")


asyncio.run(generate_image())
```

If the lesson generator is later placed inside Docker, its own `127.0.0.1` refers to
the container. Use host networking or an explicit host-access arrangement instead.

## Verification and troubleshooting

While the tunnel is running, verify the VPS listener from the Mac:

```bash
ssh -p 4537 root@144.31.76.176 'ss -lnt | grep 17859'
```

Common failures:

- `Draw Things is not listening`: enable its gRPC API server on the Mac.
- `remote port forwarding failed`: port `17859` is already occupied on the VPS.
- TLS connection failure: use a Draw Things-compatible client that trusts its bundled
  certificate and connects with the expected TLS configuration.
- Tunnel drops when the Mac sleeps: prevent sleep or install the tunnel as a macOS
  LaunchAgent in a follow-up integration.
