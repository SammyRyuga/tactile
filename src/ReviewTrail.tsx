import type { Finding, Source } from "../shared/review.ts";

export function ReviewTrail({
  finding,
  sources,
}: {
  finding: Finding;
  sources: Source[];
}) {
  const trail = finding.audit ?? [];
  const cited = sources.filter(({ id }) =>
    trail.some(({ sourceIds }) => sourceIds?.includes(id)),
  );
  return (
    <>
      {finding.reason && (
        <div className="finding-note">
          <strong>{finding.reason}</strong>
          {finding.missingInformation && (
            <p>
              <strong>What would settle it</strong> {finding.missingInformation}
            </p>
          )}
        </div>
      )}
      {finding.repair && (
        <div className="finding-note repair">
          <h4>Smallest viable change</h4>
          <p>{finding.repair.minimalFix}</p>
          <p>
            <strong>Tradeoff</strong> {finding.repair.tradeoff}
          </p>
        </div>
      )}
      {trail.length > 0 && (
        <details className="review-trail">
          <summary>
            Review trail <span>({trail.length} checks)</span>
          </summary>
          <ol>
            {trail.map(({ stage, status, observation }) => (
              <li key={stage}>
                <h4>
                  {stage}{" "}
                  <span className={`check-status ${status}`}>{status}</span>
                </h4>
                <p>{observation}</p>
              </li>
            ))}
          </ol>
          {cited.length > 0 && (
            <ul className="passages" aria-label="Cited research excerpts">
              {cited.map((source) => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  {source.relation && (
                    <span className="check-status">{source.relation}</span>
                  )}
                  {source.passage && (
                    <blockquote>
                      <small>
                        {source.passageOrigin === "source"
                          ? "Fetched source excerpt"
                          : "Cited research excerpt"}
                      </small>
                      <p>{source.passage}</p>
                    </blockquote>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </>
  );
}
