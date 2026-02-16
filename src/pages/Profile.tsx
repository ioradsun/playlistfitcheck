import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Profile = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
    } else {
      navigate(`/u/${user.id}`, { replace: true, state: { fromMenu: true } });
    }
  }, [user, loading, navigate]);

  return null;
};

export default Profile;
