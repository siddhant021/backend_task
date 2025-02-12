import mysql from "mysql2/promise";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;


const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.post("/identify", async (req, res) => {
  const { email, phoneNumber } = req.body;
  if (!email && !phoneNumber) return res.status(400).json({ error: "Invalid input" });

  try {
    const [rows] = await pool.query(
      `SELECT * FROM contacts WHERE email = ? OR phone_number = ?`,
      [email, phoneNumber]
    );

    if (rows.length === 0) {
      const [result] = await pool.query(
        `INSERT INTO contacts (email, phone_number, link_precedence) VALUES (?, ?, 'primary')`,
        [email, phoneNumber]
      );

      return res.json({
        contact: {
          primaryContactId: result.insertId,
          emails: [email],
          phoneNumbers: [phoneNumber],
          secondaryContactIds: [],
        },
      });
    }

    let primaryContactId = rows[0].id;
    let primaryContact = rows[0];

    const linked_Ids = [...new Set(rows.map((c) => c.linked_id).filter(Boolean))].sort();

    if (linked_Ids.length > 0 && linked_Ids[0] < primaryContactId) {
      primaryContactId = linked_Ids[0];

  
      const [primary] = await pool.query(`SELECT * FROM contacts WHERE id = ?`, [primaryContactId]);
      primaryContact = primary[0];
    }

    const rowIds = [...new Set(rows.map((c) => c.id).filter(Boolean))];
    linked_Ids.push(...rowIds);
    let allIds = [...new Set(linked_Ids)];

    for (let i = 1; i < rows.length; i++) {
      const [ID] = await pool.query(`SELECT id FROM contacts WHERE linked_id = ?`, [rows[i].id]);
      for (let j = 0; j < ID.length; j++) {
        allIds.push(ID[j].id);
      }
    }

    allIds = [...new Set(allIds)];

    
    for (let i = 0; i < allIds.length; i++) {
      if (allIds[i] !== primaryContactId) {
        await pool.query(`UPDATE contacts SET linked_id = ?, link_precedence = 'secondary' WHERE id = ?`, [
          primaryContactId,
          allIds[i],
        ]);
      }
    }

    let [allContacts] = await pool.query(`SELECT * FROM contacts`);

    const isExist = allContacts.some((c) => c.email === email && c.phone_number === phoneNumber);
    if (!isExist) {
      await pool.query(
        `INSERT INTO contacts (email, phone_number, linked_id, link_precedence) VALUES (?, ?, ?, 'secondary')`,
        [email, phoneNumber, primaryContactId]
      );
    }

    [allContacts] = await pool.query(`SELECT * FROM contacts`);
    const secondaryContacts = allContacts.filter((c) => c.linked_id === primaryContactId);
    const secondaryContactIds = [...new Set(secondaryContacts.map((c) => c.id).filter(Boolean))];

    secondaryContacts.unshift(primaryContact);
    const emails = [...new Set(secondaryContacts.map((c) => c.email).filter(Boolean))];
    const phoneNumbers = [...new Set(secondaryContacts.map((c) => c.phone_number).filter(Boolean))];

    return res.json({
      contact: {
        primaryContactId,
        emails,
        phoneNumbers,
        secondaryContactIds,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
