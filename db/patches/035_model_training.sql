-- Training a LoRA from inside the app, rather than by hand on fal.
--
-- A training run takes twenty minutes or so, which is far past what a
-- serverless function may sit and wait for. So the row is created the moment
-- the job is accepted and finished later: the model appears in the panel
-- straight away as "training", and becomes usable when the weights land.
--
-- On `models` rather than in a table of its own. A training run has no life
-- apart from the model it produces — nobody wants a list of trainings — and
-- putting it here means the Models panel needs no second query to know which
-- of its rows is still cooking.

ALTER TABLE models
  -- NULL for every model that was added by hand, which is all of them so far.
  -- Only a row this app trained carries a status.
  ADD COLUMN IF NOT EXISTS training_status TEXT,
  -- Where fal says how far along it is, and where the result is collected.
  -- Stored rather than rebuilt from a request id: submitToQueue already
  -- derives them, and a receipt whose URLs are lost is a job that has been
  -- paid for and cannot be collected.
  ADD COLUMN IF NOT EXISTS training_status_url TEXT,
  ADD COLUMN IF NOT EXISTS training_response_url TEXT,
  -- Why it stopped, when it stopped badly. Shown on the row: a training that
  -- failed silently is indistinguishable from one still running, and the
  -- difference decides whether to wait or to try again.
  ADD COLUMN IF NOT EXISTS training_error TEXT,
  ADD COLUMN IF NOT EXISTS training_started_at TIMESTAMPTZ;

-- The three states a run can be in, and nothing else. A typo in a status is a
-- row that is neither polled nor finished, and it would sit in the panel
-- forever looking like it was about to work.
ALTER TABLE models
  DROP CONSTRAINT IF EXISTS models_training_status;
ALTER TABLE models
  ADD CONSTRAINT models_training_status CHECK (
    training_status IS NULL
    OR training_status IN ('training', 'failed', 'ready')
  );

-- Only the unfinished ones are ever scanned, and there are seldom more than
-- one. Partial so the index stays the size of the work outstanding rather than
-- the size of the table.
CREATE INDEX IF NOT EXISTS models_training_idx
  ON models (training_started_at)
  WHERE training_status = 'training';
