import { EmptyState } from '../../components/StateViews';

// Placeholder until Stage 3 adds match setup, scoring and history.
// Intentionally has no buttons: nothing here can be done yet.
export default function MatchesScreen() {
  return (
    <EmptyState
      title="No matches yet"
      message="Add teams and players first. Starting and scoring matches arrives in a later stage."
    />
  );
}
