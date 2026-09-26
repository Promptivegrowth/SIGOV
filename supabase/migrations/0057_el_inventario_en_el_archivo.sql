-- ═══════════════════════════════════════════════════════════════════════
-- 0057 · El inventario vial tiene su sitio en el archivo
--
-- Los tomos del Inventario Vial Anual —un PDF y un Excel por subtramo, más
-- la obra adicional— son documentos del contrato: se entregan a COVINCA,
-- se consultan en una auditoría y hay que poder encontrarlos. El archivo
-- los habría aceptado como «reporte» u «otro», y ahí se pierden entre las
-- actas y los informes semanales. Tienen su propia clase.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.document_kind add value if not exists 'inventario' after 'reporte';
