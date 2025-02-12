import mysql from "mysql2/promise";
import express from "express"
import cors from 'cors'
import dotenv from 'dotenv'
import bodyParser from "body-parser";
dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}))

const PORT = process.env.PORT || 3000;

const db= await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});


app.post("/identify", async (req, res) => {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) return res.status(400).json({ error: "Invalid input" });
  
    try {
      const [rows] = await db.query(
        `SELECT * FROM contacts WHERE email = ? OR phone_number = ?`,
        [email, phoneNumber]
      );
      if (rows.length === 0){
        const result=await db.query(
          `INSERT INTO contacts (email, phone_number, link_precedence) VALUES (?, ?, 'primary')`,
           [email, phoneNumber]
        );
        return res.json({
            contact: {
            primaryContactId: result[0].insertId,
            email:[email],
            phoneNumber:[phoneNumber],
            secondaryContactIds:[]
          }
        });
      }

      
      let primaryContactId=rows[0].id;
      let primaryContact=rows[0];
    
      const linked_Ids=[...new Set(rows.map(c => c.linked_id).filter(Boolean))]
      linked_Ids.sort();

      if(linked_Ids.length>0&&linked_Ids[0]<primaryContactId)
      {
          primaryContactId=linked_Ids[0];
          primaryContact=await db.query(`Select * from contacts where id=${primaryContactId}`)
      }
      
      const rowsId=[...new Set(rows.map(c => c.id).filter(Boolean))];
      linked_Ids.push(...rowsId);
      let allIds=[...new Set(linked_Ids)];

      for(let i=1;i<rows.length;i++)
      {
          const [ID]=await db.query(`Select id from contacts where linked_id=${rows[i].id}`);
          for(let j=0;j<ID.length;j++)
          { 
              allIds.push(ID[j].id);
          }
        
      }
      allIds=[...new Set(allIds)];
      for(let i=0;i<allIds.length;i++)
      {
           if(allIds[i]!=primaryContactId)
           {
               await db.query(`Update contacts SET linked_id=${primaryContactId} where id=${allIds[i]}`)
               await db.query(`Update contacts SET link_precedence='secondary' where id=${allIds[i]}`)
           }
      }
      
      
      let [allContacts] = await db.query(
        `SELECT * FROM contacts`,
      );

      const Isexist=allContacts.filter(c=>c.email==email&&c.phone_number==phoneNumber)
      if(Isexist.length==0){
           await db.query(
               `INSERT INTO contacts (email, phone_number,linked_id, link_precedence) VALUES (?, ?, ?,'secondary')`,
           [email, phoneNumber,primaryContactId]
          );
      }

       [allContacts] = await db.query(
        `SELECT * FROM contacts`,
      );
      
      const secondaryContacts = allContacts.filter(c => c.linked_id==primaryContactId);
      const secondaryContactIds=[...new Set(secondaryContacts.map(c => c.id).filter(Boolean))]
      secondaryContacts.unshift(primaryContact);
      const emails = [...new Set(secondaryContacts.map(c => c.email).filter(Boolean))];
      const phoneNumbers = [...new Set(secondaryContacts.map(c => c.phone_number).filter(Boolean))];
       
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