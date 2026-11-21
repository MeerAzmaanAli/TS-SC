import os
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TS-SC Public API Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Vercel service binding injects the internal solver URL via SOLVER_URL
SOLVER_URL = os.environ.get("SOLVER_URL", "http://localhost:8000")


@app.get("/health")
@app.get("/api/health")
async def gateway_health():
    """Health check for gateway and upstream solver."""
    solver_status = "unknown"
    detail = None
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{SOLVER_URL.rstrip('/')}/health")
            if resp.status_code == 200:
                solver_status = "connected"
                try:
                    detail = resp.json()
                except Exception:
                    detail = resp.text
            else:
                solver_status = f"http_{resp.status_code}"
                detail = resp.text
    except Exception as e:
        solver_status = "unavailable"
        detail = f"{type(e).__name__}: {str(e)}"

    return {
        "status": "ok" if solver_status == "connected" else "degraded",
        "gateway": "online",
        "internal_solver": solver_status,
        "solver_url": SOLVER_URL,
        "detail": detail,
    }


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_to_solver(request: Request, path: str):
    """Forward requests from public /api/* gateway to internal solver service."""
    # Strip any redundant 'api/' prefix passed down from routing
    clean_subpath = path
    if clean_subpath.startswith("api/"):
        clean_subpath = clean_subpath[4:]
    elif clean_subpath == "api":
        clean_subpath = ""

    target_url = f"{SOLVER_URL.rstrip('/')}/{clean_subpath.lstrip('/')}"

    body = await request.body()

    # Dynamic read timeout: accommodate solver budgets (default 2 mins / 120s up to 5 mins / 300s)
    read_timeout = 300.0
    try:
        if body and b"time_limit_seconds" in body:
            import json
            data = json.loads(body)
            custom_limit = float(data.get("time_limit_seconds", 120.0))
            read_timeout = max(300.0, custom_limit + 60.0)
    except Exception:
        pass

    timeout_cfg = httpx.Timeout(read_timeout, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout_cfg) as client:
        req_headers = {
            k: v
            for k, v in request.headers.items()
            if k.lower() not in ("host", "content-length", "accept-encoding")
        }

        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=req_headers,
                content=body,
                params=request.query_params,
            )
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            return Response(
                content=f'{{"status": "error", "message": "Cannot reach solver at {target_url} ({type(e).__name__}). Check if solver service is running and SOLVER_URL is set in environment."}}',
                status_code=502,
                media_type="application/json",
            )
        except httpx.ReadTimeout:
            return Response(
                content=f'{{"status": "error", "message": "Solver calculation timed out after {int(read_timeout)}s. Try increasing solver time limit in Admin Developer Settings or reducing constraint complexity."}}',
                status_code=504,
                media_type="application/json",
            )
        except httpx.TimeoutException as e:
            return Response(
                content=f'{{"status": "error", "message": "Solver request timed out: {str(e)}"}}',
                status_code=504,
                media_type="application/json",
            )
        except Exception as e:
            return Response(
                content=f'{{"status": "error", "message": "Gateway error connecting to solver: {str(e)}"}}',
                status_code=502,
                media_type="application/json",
            )

        resp_headers = {
            k: v
            for k, v in response.headers.items()
            if k.lower() not in ("content-length", "content-encoding", "transfer-encoding")
        }

        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=resp_headers,
            media_type=response.headers.get("content-type", "application/json"),
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)

