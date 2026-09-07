-- Product discovery is link-driven and ephemeral. Remove the catalog tables so
-- database size no longer grows with the number of stores or products.
DROP TABLE IF EXISTS "ProductLink";
DROP TABLE IF EXISTS "StoreConnection";
