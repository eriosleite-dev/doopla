import { respondRepresentationRequestAction } from '../actions';
import type { IncomingRepresentationRequest } from '../data';
import { accentButtonClass, eyebrowClass, ghostButtonClass } from '../ui';

export function IncomingRequests({ requests }: { requests: IncomingRepresentationRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div id="solicitacoes" className="flex flex-col gap-3">
      <p className={eyebrowClass}>Bookers que querem te representar</p>
      {requests.map((req) => (
        <div key={req.id} className="flex flex-col gap-3 rounded-[18px] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{req.bookerName}</p>
            {req.message && <p className="mt-1 text-[13px] text-[var(--ink)]/60">&ldquo;{req.message}&rdquo;</p>}
          </div>
          <div className="flex gap-2">
            <form action={respondRepresentationRequestAction}>
              <input type="hidden" name="requestId" value={req.id} />
              <input type="hidden" name="decision" value="aceitar" />
              <button type="submit" className={accentButtonClass}>
                Aceitar
              </button>
            </form>
            <form action={respondRepresentationRequestAction}>
              <input type="hidden" name="requestId" value={req.id} />
              <input type="hidden" name="decision" value="recusar" />
              <button type="submit" className={ghostButtonClass}>
                Recusar
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
