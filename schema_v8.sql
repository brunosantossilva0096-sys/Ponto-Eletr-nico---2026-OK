-- Adicionando coluna para restrição de Ponto por Computador (MAC Address)
ALTER TABLE employees ADD COLUMN allowed_mac_address TEXT NULL;
