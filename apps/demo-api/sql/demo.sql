CREATE TABLE IF NOT EXISTS demo_documents (
 id text PRIMARY KEY,
 title text NOT NULL,
 body text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved'))
);
INSERT INTO demo_documents (id,title,body) VALUES
 ('doc-1','Quarterly planning','Draft operating plan'),
 ('doc-2','Security review','Review authorization controls'),
 ('doc-3','Team handbook','Onboarding reference')
ON CONFLICT (id) DO NOTHING;
