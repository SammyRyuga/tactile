import { uniqueSourcesByUrl } from "../shared/review.ts";
import { reviewerStageLabel } from "../shared/reviewers.ts";
import type { Finding, Source } from "../shared/review.ts";

export function ReviewTrail({
  finding,
  sources,
  crossfire,
}: {
  finding: Finding;
  sources: Source[];
  crossfire: boolean;
}) {
  const trail = finding.audit ?? [];
  const cited = uniqueSourcesByUrl(
    sources.filter(({ id }) =>
      trail.some(({ sourceIds }) => sourceIds?.includes(id)),
    ),
  );
  return (
    <>
      {finding.proposalExcerpt && (
        <div className="finding-note">
          <strong>Verified proposal excerpt</strong>
          <blockquote>{finding.proposalExcerpt}</blockquote>
        </div>
      )}
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
      {finding.projectCitations?.length ? (
        <div className="finding-note project-citations">
          <h4>Reviewer-supplied evidence</h4>
          {finding.projectCitations.map(({ id, title, quote, relation }) => (
            <blockquote key={id}>
              <small>
                {title} · {relation}
              </small>
              <p>{quote}</p>
            </blockquote>
          ))}
        </div>
      ) : null}
      {finding.repair && (
        <div className="finding-note repair">
          <h4>Smallest viable change</h4>
          <p>{finding.repair.minimalFix}</p>
          {finding.repair.tradeoff && (
            <p>
              <strong>Tradeoff</strong> {finding.repair.tradeoff}
            </p>
          )}
        </div>
      )}
      {trail.length > 0 && (
        <details className="review-trail">
          <summary>
            Review trail{" "}
            <span>
              ({trail.length} {trail.length === 1 ? "check" : "checks"})
            </span>
          </summary>
          <ol>
            {trail.map(({ stage, status, observation }, index) => (
              <li key={`${stage}-${index}`}>
                <h4>
                  {crossfire ? reviewerStageLabel(stage) : stage}{" "}
                  <span className={`check-status ${status}`}>{status}</span>
                </h4>
                <p>{observation}</p>
              </li>
            ))}
          </ol>
          {cited.length > 0 && (
            <ul className="passages" aria-label="Cited evidence">
              {cited.map((source) => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  {!source.passage && source.diagnostic ? (
                    <span className="check-status">Source unreadable</span>
                  ) : (
                    source.relation && (
                      <span className="check-status">{source.relation}</span>
                    )
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
